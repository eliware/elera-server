import { createManagedMetadataForTest } from "../../../test-fixtures/managed-metadata.mjs";
import { createHash } from "node:crypto";
import { expect, jest, test } from "@jest/globals";
import { createManagedTokenLifecycle } from "../../../src/metadata/managed/token-lifecycle.mjs";

test("creates scoped token lifecycle operations", () => {
  const lifecycle = createManagedTokenLifecycle({ q: async () => [[]] });
  expect(Object.keys(lifecycle)).toEqual(["issueToken", "revokeToken", "authenticate"]);
});

test("resolves scoped tokens to their application, database, identity, and scopes", async () => {
  const token = "runtime-token";
  const hash = createHash("sha256").update(token).digest("hex");
  let authenticationSql;
  const managed = createManagedMetadataForTest({
    query: async (sql) => {
      authenticationSql = sql;
      return [
        [
          {
            tokenId: "42",
            name: "runtime-token",
            application: "payments",
            database: "billing",
            physical_database: "elera_db_42",
            identity: "web",
            token_hash: hash,
            scopes_json: '["database:read"]',
          },
        ],
      ];
    },
  });

  await expect(managed.authenticate(token)).resolves.toEqual({
    name: "runtime-token",
    tokenId: "42",
    application: "payments",
    database: "billing",
    physicalDatabase: "elera_db_42",
    identity: "web",
    scopes: ["database:read"],
  });
  expect(authenticationSql).toContain("i.active=TRUE");
  expect(authenticationSql).toContain("d.name AS database");
  expect(authenticationSql).toContain("d.physical_name AS physical_database");
  expect(authenticationSql).toContain(`t.token_hash='${hash}'`);
});

test("requires an active identity when authenticating a scoped token", async () => {
  const token = "revoked-identity-token";
  const hash = createHash("sha256").update(token).digest("hex");
  const managed = createManagedMetadataForTest({ query: async () => [[]] });
  await expect(managed.authenticate(token)).resolves.toBeNull();
  expect(hash).toHaveLength(64);
});

test("keeps app-admin tokens application-scoped without assigning a database identity", async () => {
  const token = "app-admin-token";
  const hash = createHash("sha256").update(token).digest("hex");
  const managed = createManagedMetadataForTest({
    query: async () => [
      [
        {
          tokenId: "admin-1",
          name: "app-admin-token",
          application: "payments",
          database: null,
          identity: null,
          token_hash: hash,
          scopes_json: '["app:admin"]',
        },
      ],
    ],
  });

  await expect(managed.authenticate(token)).resolves.toEqual({
    name: "app-admin-token",
    tokenId: "admin-1",
    application: "payments",
    database: null,
    identity: null,
    scopes: ["app:admin"],
  });
});

test("issues and revokes scoped tokens with default scopes", async () => {
  const queries = [];
  const q = jest.fn(async (sql) => {
    queries.push(sql);
    return sql.startsWith("SELECT") ? [[{ application: "payments", database: "billing" }]] : [[]];
  });
  const lifecycle = createManagedTokenLifecycle({ q });
  const issued = await lifecycle.issueToken({
    tokenName: "worker-token",
    application: "payments",
    identity: "worker",
  });
  expect(issued).toMatchObject({
    name: "worker-token",
    application: "payments",
    database: "billing",
    identity: "worker",
    scopes: [],
  });
  expect(queries[2]).toContain("[]");
  await expect(lifecycle.revokeToken()).rejects.toThrow("token is invalid");
  await expect(lifecycle.revokeToken(undefined)).rejects.toThrow("token is invalid");
  await expect(lifecycle.revokeToken(null)).rejects.toThrow("token is invalid");
  await expect(
    lifecycle.revokeToken({ tokenName: "worker-token", application: "payments" }),
  ).resolves.toMatchObject({ revoked: true });
  const noStoredToken = createManagedTokenLifecycle({
    q: async (sql) => (sql.startsWith("SELECT") ? [[{ token_id: "42" }]] : [[]]),
  });
  await expect(
    noStoredToken.revokeToken({ tokenName: "worker-token", application: "payments" }),
  ).resolves.toMatchObject({ revoked: true });
});

test("creates and revokes a MariaDB account with the persistent token", async () => {
  const tokenAccounts = { create: jest.fn(), revoke: jest.fn() };
  let tokenHash;
  const q = jest.fn(async (sql) => {
    if (sql.includes("FROM elera_meta.identities"))
      return [[{ application: "payments", database: "billing" }]];
    if (sql.includes("SELECT token_id")) return [[{ token_id: "42" }]];
    if (sql.includes("SELECT t.token_id"))
      return [
        [
          {
            tokenId: "42",
            name: "persistent-worker",
            application: "payments",
            database: "billing",
            identity: "worker",
            token_hash: tokenHash,
            scopes_json: '["database:read"]',
          },
        ],
      ];
    return [[]];
  });
  const lifecycle = createManagedTokenLifecycle({ q, tokenAccounts });
  const issued = await lifecycle.issueToken({
    tokenName: "persistent-worker",
    application: "payments",
    identity: "worker",
    scopes: ["database:read"],
  });
  tokenHash = createHash("sha256").update(issued.token).digest("hex");
  await expect(lifecycle.authenticate(issued.token)).resolves.toMatchObject({ tokenId: "42" });
  await lifecycle.revokeToken({ tokenName: "persistent-worker", application: "payments" });
  expect(tokenAccounts.create).toHaveBeenCalledWith(
    expect.objectContaining({ tokenId: "42", token: issued.token, application: "payments" }),
  );
  expect(tokenAccounts.revoke).toHaveBeenCalledWith("42");
});

test("rejects invalid token owners and missing identities", async () => {
  const lifecycle = createManagedTokenLifecycle({ q: async () => [[]] });
  await expect(
    lifecycle.issueToken({ tokenName: "", application: "payments", identity: "worker" }),
  ).rejects.toThrow("token is invalid");
  await expect(
    lifecycle.issueToken({ tokenName: "token", application: "", identity: "worker" }),
  ).rejects.toThrow("application is invalid");
  await expect(
    lifecycle.issueToken({ tokenName: "token", application: "payments", identity: "" }),
  ).rejects.toThrow("identity is invalid");
  await expect(
    lifecycle.issueToken({ tokenName: "token", application: "payments", identity: "worker" }),
  ).rejects.toMatchObject({ statusCode: 404 });

  const wrongOwner = createManagedTokenLifecycle({
    q: async () => [[{ application: "other", database: "billing" }]],
  });
  await expect(
    wrongOwner.issueToken({ tokenName: "token", application: "payments", identity: "worker" }),
  ).rejects.toMatchObject({ statusCode: 400 });
});

test("returns null for absent or unknown tokens and normalizes stored scopes", async () => {
  const token = "known-token";
  const hash = createHash("sha256").update(token).digest("hex");
  const lifecycle = createManagedTokenLifecycle({
    q: async () => [
      [
        {
          name: "known-token",
          application: "payments",
          database: "billing",
          identity: "worker",
          token_hash: hash,
          scopes_json: ["database:read"],
        },
      ],
    ],
  });
  await expect(lifecycle.authenticate()).resolves.toBeNull();
  await expect(lifecycle.authenticate("unknown-token")).resolves.toBeNull();
  await expect(lifecycle.authenticate(token)).resolves.toMatchObject({
    scopes: ["database:read"],
  });

  const emptyScopes = createManagedTokenLifecycle({
    q: async () => [
      [
        {
          name: "known-token",
          application: "payments",
          database: "billing",
          identity: "worker",
          token_hash: hash,
          scopes_json: null,
        },
      ],
    ],
  });
  await expect(emptyScopes.authenticate(token)).resolves.toMatchObject({
    scopes: [],
  });
});
