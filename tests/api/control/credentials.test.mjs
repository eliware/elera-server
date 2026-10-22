import { expect, jest, test } from "@jest/globals";
import { handleControlCredentialRoute } from "../../../src/api/control/credentials.mjs";

const request = (value = {}) => ({
  async *[Symbol.asyncIterator]() {
    yield JSON.stringify(value);
  },
});
const setup = (method, path, body, options = {}) => {
  const response = { json: jest.fn() };
  return {
    context: {
      method,
      url: new URL(`http://localhost${path}`),
      request: request(body),
      response,
      environment: {},
      auth: { root: true },
    },
    response,
    ...options,
  };
};

test("returns an unavailable result when credential leasing is not configured", async () => {
  const data = setup("POST", "/api/v1/credentials/lease");
  await expect(
    handleControlCredentialRoute(data.context, { validate: (value) => value }),
  ).resolves.toBe(true);
  expect(data.response.json).toHaveBeenCalledWith(
    501,
    expect.objectContaining({ operation: "credentials.lease" }),
  );
});

test("requires credential issue or refresh scope for lease requests", async () => {
  const data = setup(
    "POST",
    "/api/v1/credentials/lease",
    {},
    { auth: { scopes: ["status:read"] } },
  );
  data.context.auth = { scopes: ["status:read"] };
  const leaseCredentials = jest.fn().mockResolvedValue({ credentials: { username: "app" } });
  await expect(
    handleControlCredentialRoute(data.context, { leaseCredentials, validate: (value) => value }),
  ).resolves.toBe(true);
  expect(data.response.json).toHaveBeenCalledWith(403, expect.objectContaining({ ok: false }));
  expect(leaseCredentials).not.toHaveBeenCalled();
  data.context.auth = { scopes: ["credential:issue"] };
  await handleControlCredentialRoute(data.context, {
    leaseCredentials: jest.fn().mockResolvedValue({ credentials: { username: "app" } }),
    validate: (value) => value,
  });
  expect(data.response.json).toHaveBeenLastCalledWith(200, expect.any(Object));
  data.context.auth = { scopes: ["credential:refresh"] };
  await handleControlCredentialRoute(data.context, {
    leaseCredentials: jest.fn().mockResolvedValue({ credentials: { username: "app" } }),
    validate: (value) => value,
  });
  expect(data.response.json).toHaveBeenLastCalledWith(200, expect.any(Object));
  data.context.auth = undefined;
  await handleControlCredentialRoute(data.context, {
    leaseCredentials: jest.fn(),
    validate: (value) => value,
  });
  expect(data.response.json).toHaveBeenLastCalledWith(403, expect.any(Object));
});

test("leases credentials and creates a bundle when needed", async () => {
  const bundle = jest.fn(() => ({ bundle: true }));
  const leaseCredentials = jest.fn().mockResolvedValue({ account: "app" });
  const data = setup("POST", "/api/v1/credentials/lease", { application: "app" });
  data.context.environment = { ELERA_NODE_SQL_PORT: "3307", ELERA_HTTP_PORT: "8081" };
  await handleControlCredentialRoute(data.context, {
    leaseCredentials,
    bundle,
    validate: (value) => value,
  });
  expect(bundle).toHaveBeenCalledWith({ account: "app", ports: { sql: 3307, http: 8081 } });
  expect(data.response.json).toHaveBeenCalledWith(
    200,
    expect.objectContaining({ data: { bundle: true } }),
  );
});

test("returns lease credentials that already contain a bundle", async () => {
  const data = setup("POST", "/api/v1/credentials/lease");
  const leaseCredentials = jest.fn().mockResolvedValue({ credentials: { username: "app" } });
  await handleControlCredentialRoute(data.context, {
    leaseCredentials,
    validate: (value) => value,
  });
  expect(data.response.json).toHaveBeenCalledWith(
    200,
    expect.objectContaining({ data: { credentials: { username: "app" } } }),
  );
});

test("refreshes and revokes managed credentials", async () => {
  const data = setup("POST", "/api/v1/credentials/refresh", { identity: "runtime" });
  const bundle = jest.fn(() => ({ bundle: true }));
  const managed = {
    lease: jest.fn().mockResolvedValue({ username: "app" }),
    revokeIdentity: jest.fn().mockResolvedValue({ revoked: true }),
  };
  await handleControlCredentialRoute(data.context, { managed, bundle });
  expect(data.response.json).toHaveBeenCalledWith(
    200,
    expect.objectContaining({ data: { bundle: true } }),
  );
  data.context.url.pathname = "/api/v1/credentials/revoke";
  await handleControlCredentialRoute(data.context, { managed, bundle });
  expect(managed.revokeIdentity).toHaveBeenCalledWith({
    identity: "runtime",
    application: undefined,
  });
});

test("returns false for unrelated requests and reports missing management", async () => {
  const data = setup("GET", "/api/v1/status");
  await expect(handleControlCredentialRoute(data.context)).resolves.toBe(false);
  data.context.method = "POST";
  data.context.url.pathname = "/api/v1/credentials/refresh";
  data.context.auth = { scopes: [] };
  await expect(handleControlCredentialRoute(data.context)).resolves.toBe(true);
  expect(data.response.json).toHaveBeenLastCalledWith(403, expect.any(Object));
  data.context.auth = { root: true };
  await expect(handleControlCredentialRoute(data.context)).resolves.toBe(true);
  expect(data.response.json).toHaveBeenCalledWith(
    501,
    expect.objectContaining({ error: "credential management is not configured" }),
  );
});

test("rejects credential revocation for another application", async () => {
  const data = setup(
    "POST",
    "/api/v1/credentials/revoke",
    {
      identity: "runtime",
      application: "other",
    },
    { auth: { application: "app", scopes: ["credential:refresh"] } },
  );
  data.context.auth = { application: "app", scopes: ["credential:refresh"] };
  const managed = { lease: jest.fn(), revokeIdentity: jest.fn() };
  await handleControlCredentialRoute(data.context, { managed });
  expect(data.response.json).toHaveBeenCalledWith(
    403,
    expect.objectContaining({ error: "identity belongs to another application" }),
  );
  expect(managed.revokeIdentity).not.toHaveBeenCalled();
});
