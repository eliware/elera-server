import { createManagedMetadataForTest } from "../../../test-fixtures/managed-metadata.mjs";
import { createHash } from "node:crypto";
import { expect, test } from "@jest/globals";
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
