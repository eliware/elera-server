import { expect, jest, test } from "@jest/globals";
import { handleManagedRoute } from "../../../src/api/routes/managed.mjs";

const request = (body = {}) => ({
  url: "http://localhost/api?v=1&application=app",
  async *[Symbol.asyncIterator]() {
    if (Object.keys(body).length) yield JSON.stringify(body);
  },
});
const context = (method, path, body = {}) => {
  const response = { json: jest.fn() };
  const managed = {
    listDatabases: jest.fn(async () => ["app"]),
    listIdentities: jest.fn(async () => []),
    createDatabase: jest.fn(async () => ({ database: "app" })),
    createIdentity: jest.fn(async () => ({ identity: "id" })),
    rotateIdentity: jest.fn(async () => ({})),
    issueToken: jest.fn(async () => ({})),
    revokeToken: jest.fn(async () => ({})),
    revokeIdentity: jest.fn(async () => ({})),
  };
  return {
    method,
    path,
    request: request(body),
    response,
    managed,
    auth: {
      scopes: [
        "metadata:read",
        "database:read",
        "database:provision",
        "identity:read",
        "identity:provision",
        "identity:rotate",
        "token:create",
        "token:revoke",
        "identity:revoke",
      ],
    },
  };
};
test("handles all managed metadata, database, identity, and token routes", async () => {
  const routes = [
    ["GET", "/api/v1/metadata/export"],
    ["GET", "/api/v1/databases"],
    ["POST", "/api/v1/databases", { application: "app", database: "app" }],
    ["GET", "/api/v1/identities"],
    ["POST", "/api/v1/identities", { application: "app", database: "app", identity: "id" }],
    ["POST", "/api/v1/identities/rotate", { identity: "id" }],
    ["POST", "/api/v1/tokens", { name: "t", scopes: [] }],
    ["POST", "/api/v1/tokens/revoke", { name: "t" }],
    ["POST", "/api/v1/identities/revoke", { identity: "id" }],
  ];
  for (const [method, path, body] of routes) {
    const c = context(method, path, body);
    expect(await handleManagedRoute(c)).toBe(true);
    expect(c.response.json).toHaveBeenCalled();
    expect(await handleManagedRoute({ ...context(method, path, body), auth: { scopes: [] } })).toBe(
      false,
    );
  }
  expect(
    await handleManagedRoute({ ...context("GET", "/api/v1/databases"), auth: { root: true } }),
  ).toBe(true);
  expect(
    await handleManagedRoute({
      ...context("GET", "/api/v1/identities"),
      request: {
        url: "http://localhost",
        [Symbol.asyncIterator]() {
          return { next: () => Promise.reject(new Error("bad body")) };
        },
      },
    }),
  ).toBe(true);
  expect(await handleManagedRoute({ ...context("GET", "/other"), managed: undefined })).toBe(false);
});

test("returns SQL connection metadata and a root full metadata snapshot", async () => {
  const root = context("GET", "/api/v1/sql/connection");
  root.managed.sqlConnection = jest.fn(() => ({ host: "node", username: "elera_root" }));
  root.auth = { root: true };
  await expect(handleManagedRoute(root)).resolves.toBe(true);
  expect(root.response.json).toHaveBeenCalledWith(200, {
    ok: true,
    operation: "sql.connection",
    data: { host: "node", username: "elera_root" },
  });
  expect(await handleManagedRoute({ ...root, auth: null })).toBe(false);

  const exportRoute = context("GET", "/api/v1/metadata/export");
  exportRoute.auth = { root: true };
  exportRoute.managed.listDatabaseRecords = jest.fn(async () => [{ physical_name: "app_db" }]);
  exportRoute.managed.exportMetadataSnapshot = jest.fn(async () => ({ format: 1 }));
  await handleManagedRoute(exportRoute);
  expect(exportRoute.response.json).toHaveBeenCalledWith(200, {
    ok: true,
    operation: "metadata.export",
    data: {
      databases: [{ physical_name: "app_db" }],
      identities: [],
      metadataSnapshot: { format: 1 },
    },
  });
});
test("rejects scoped routes when the optional scope collection is absent", async () => {
  const c = context("GET", "/api/v1/databases");
  expect(await handleManagedRoute({ ...c, auth: {} })).toBe(false);
});
test("rejects managed access when authentication is absent", async () => {
  const c = context("GET", "/api/v1/databases");
  expect(await handleManagedRoute({ ...c, auth: undefined })).toBe(false);
});
test("uses the databaseName fallback when database is omitted", async () => {
  const c = context("POST", "/api/v1/databases", {
    application: "app",
    database: null,
    databaseName: "fallback",
  });
  expect(await handleManagedRoute(c)).toBe(true);
});

test("supports database deletion by stable ID with dry-run and confirmation", async () => {
  const response = { json: jest.fn() };
  const managed = { deleteDatabase: jest.fn(async (body) => body) };
  const common = {
    method: "POST",
    path: "/api/v1/databases/db-1/delete",
    response,
    managed,
    auth: { scopes: ["database:delete"] },
  };
  expect(
    await handleManagedRoute({
      ...common,
      request: request({ dryRun: true, idempotencyKey: "k" }),
    }),
  ).toBe(true);
  expect(response.json).toHaveBeenCalledWith(
    200,
    expect.objectContaining({ operation: "database.delete" }),
  );
  expect(
    await handleManagedRoute({
      ...common,
      request: request({ confirm: true, idempotencyKey: "k" }),
    }),
  ).toBe(true);
});
test("rejects unauthorized database deletion and implicit token scopes", async () => {
  const response = { json: jest.fn() };
  const managed = { deleteDatabase: jest.fn(), issueToken: jest.fn() };
  await expect(
    handleManagedRoute({
      method: "POST",
      path: "/api/v1/databases/db/delete",
      request: request({}),
      response,
      managed,
      auth: { scopes: [] },
    }),
  ).resolves.toBe(false);
  await expect(
    handleManagedRoute({
      method: "POST",
      path: "/api/v1/tokens",
      request: request({ name: "t" }),
      response,
      managed,
      auth: { scopes: ["token:create"] },
    }),
  ).rejects.toMatchObject({ statusCode: 400 });
});
test("allows app-admin tokens to provision only their own application", async () => {
  const response = { json: jest.fn() };
  const managed = {
    createDatabase: jest.fn(async () => ({ database: "billing" })),
    createIdentity: jest.fn(async () => ({ identity: "runtime" })),
    issueToken: jest.fn(async () => ({ token: "secret" })),
  };
  const auth = { application: "billing", scopes: ["app:admin"] };
  const routes = [
    ["/api/v1/databases", { application: "billing", database: "billing" }],
    ["/api/v1/identities", { application: "billing", database: "billing", identity: "runtime" }],
    [
      "/api/v1/tokens",
      { application: "billing", identity: "runtime", name: "runtime", scopes: ["database:read"] },
    ],
  ];
  for (const [path, body] of routes) {
    await expect(
      handleManagedRoute({ method: "POST", path, request: request(body), response, managed, auth }),
    ).resolves.toBe(true);
  }
  await expect(
    handleManagedRoute({
      method: "POST",
      path: "/api/v1/databases",
      request: request({ application: "other", database: "other" }),
      response,
      managed,
      auth,
    }),
  ).resolves.toBe(false);
});

test("rejects identity rotation across an app-admin application boundary", async () => {
  const c = context("POST", "/api/v1/identities/rotate", {
    identity: "runtime",
    application: "other",
  });
  c.auth = { application: "billing", scopes: ["identity:rotate"] };
  expect(await handleManagedRoute(c)).toBe(false);
  expect(c.managed.rotateIdentity).not.toHaveBeenCalled();
});
