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
    application: "payments",
    database: "billing",
    physicalDatabase: "elera_db_42",
    identity: "web",
    scopes: ["database:read"],
  });
  expect(authenticationSql).toContain("LEFT JOIN");
  expect(authenticationSql).toContain("d.name AS database");
  expect(authenticationSql).toContain("d.physical_name AS physical_database");
});

test("keeps app-admin tokens application-scoped without assigning a database identity", async () => {
  const token = "app-admin-token";
  const hash = createHash("sha256").update(token).digest("hex");
  const managed = createManagedMetadataForTest({
    query: async () => [
      [
        {
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
  expect(queries[1]).toContain("[]");
  await expect(lifecycle.revokeToken()).rejects.toThrow("token is invalid");
  await expect(
    lifecycle.revokeToken({ tokenName: "worker-token", application: "payments" }),
  ).resolves.toMatchObject({ revoked: true });
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
