import { expect, jest, test } from "@jest/globals";
import { handleManagedAccessRoute } from "../../../src/api/routes/managed-access.mjs";

const context = (path, body, managed, auth = { root: true }) => ({
  method: "POST",
  path,
  request: {
    async *[Symbol.asyncIterator]() {
      yield JSON.stringify(body);
    },
  },
  response: { json: jest.fn() },
  managed,
  auth,
});

test("creates and revokes scoped tokens", async () => {
  const managed = {
    issueToken: jest.fn().mockResolvedValue({ token: "token" }),
    revokeToken: jest.fn(),
  };
  const create = context("/api/v1/tokens", { application: "app", scopes: ["app:read"] }, managed);
  await expect(handleManagedAccessRoute(create)).resolves.toBe(true);
  expect(managed.issueToken).toHaveBeenCalledWith({ application: "app", scopes: ["app:read"] });
  const revoke = context("/api/v1/tokens/revoke", { application: "app", name: "runtime" }, managed);
  await handleManagedAccessRoute(revoke);
  expect(managed.revokeToken).toHaveBeenCalledWith({ application: "app", tokenName: "runtime" });
});

test("rejects token requests without scopes and leaves unrelated routes alone", async () => {
  const managed = { issueToken: jest.fn() };
  await expect(
    handleManagedAccessRoute(context("/api/v1/tokens", { application: "app" }, managed)),
  ).rejects.toMatchObject({ statusCode: 400 });
  await expect(handleManagedAccessRoute(context("/api/v1/other", {}, managed))).resolves.toBe(
    false,
  );
});

test("revokes an identity when its scope is allowed", async () => {
  const managed = { revokeIdentity: jest.fn().mockResolvedValue({ revoked: true }) };
  const request = context("/api/v1/identities/revoke", { identity: "runtime" }, managed);
  await handleManagedAccessRoute(request);
  expect(managed.revokeIdentity).toHaveBeenCalledWith({
    identity: "runtime",
    application: undefined,
  });
  expect(request.response.json).toHaveBeenCalledWith(
    200,
    expect.objectContaining({ operation: "identity.revoke" }),
  );
});

test("rejects token operations without the required scope", async () => {
  const managed = { issueToken: jest.fn(), revokeToken: jest.fn() };
  const auth = { scopes: ["app:admin"], application: "other" };
  await expect(
    handleManagedAccessRoute(
      context("/api/v1/tokens", { application: "app", scopes: [] }, managed, auth),
    ),
  ).resolves.toBe(false);
  await expect(
    handleManagedAccessRoute(
      context("/api/v1/tokens/revoke", { application: "app", name: "runtime" }, managed, auth),
    ),
  ).resolves.toBe(false);
  await expect(
    handleManagedAccessRoute(
      context("/api/v1/identities/revoke", { identity: "runtime" }, managed, { scopes: [] }),
    ),
  ).resolves.toBe(false);
  expect(managed.issueToken).not.toHaveBeenCalled();
  expect(managed.revokeToken).not.toHaveBeenCalled();
});

test("rejects identity revocation across an app-admin application boundary", async () => {
  const managed = { revokeIdentity: jest.fn() };
  const request = context(
    "/api/v1/identities/revoke",
    { identity: "runtime", application: "other" },
    managed,
    { application: "app", scopes: ["identity:revoke"] },
  );
  await expect(handleManagedAccessRoute(request)).resolves.toBe(false);
  expect(managed.revokeIdentity).not.toHaveBeenCalled();
});
