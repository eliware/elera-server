import { expect, test } from "@jest/globals";
import { createManagedMetadata } from "../../src/metadata/managed.mjs";
import { createManagedMetadataForTest } from "../../test-fixtures/managed-metadata.mjs";

test("requires the metadata query callback", () => {
  expect(() => createManagedMetadata()).toThrow("query function is required");
});

test("manages databases, identities, and scoped tokens without exposing policy SQL", async () => {
  const calls = [];
  let tokenHash;
  const managed = createManagedMetadataForTest({
    credentialKey: "test-key",
    query: async (sql) => {
      calls.push(sql);
      if (sql.includes("INSERT INTO `elera_meta`.scoped_tokens"))
        tokenHash = sql.match(/VALUES \([^,]+, '([0-9a-f]+)'/)?.[1];
      if (sql.includes("FROM `elera_meta`.managed_databases"))
        return [[{ name: "billing", application: "payments" }]];
      if (sql.includes("FROM `elera_meta`.identities"))
        return [[{ name: "runtime", application: "payments" }]];
      if (sql.includes("FROM `elera_meta`.scoped_tokens"))
        return [
          [
            {
              name: "app-token",
              application: "payments",
              identity: "runtime",
              token_hash: tokenHash,
              scopes_json: '["database:read"]',
            },
          ],
        ];
      return [[]];
    },
  });
  expect(
    await managed.createDatabase({ application: "payments", databaseName: "billing" }),
  ).toEqual(
    expect.objectContaining({
      application: "payments",
      database: "billing",
      databaseId: expect.any(String),
    }),
  );
  const identity = await managed.createIdentity({
    application: "payments",
    databaseName: "billing",
    identity: "runtime",
    purpose: "runtime",
    grants: ["SELECT"],
  });
  expect(identity.username).toBe("payments_runtime");
  expect(identity.password).toBeTruthy();
  expect(await managed.listDatabases()).toHaveLength(1);
  expect(await managed.listIdentities("payments")).toHaveLength(1);
  const token = await managed.issueToken({
    tokenName: "app-token",
    application: "payments",
    identity: "runtime",
    scopes: ["database:read"],
  });
  expect(token.token).toBeTruthy();
  expect((await managed.authenticate(token.token)).scopes).toEqual(["database:read"]);
  expect(await managed.revokeToken({ tokenName: "app-token", application: "payments" })).toEqual({
    name: "app-token",
    application: "payments",
    revoked: true,
  });
  expect(await managed.revokeIdentity("runtime")).toEqual({ identity: "runtime", revoked: true });
  expect(calls.some((sql) => sql.includes("CREATE DATABASE"))).toBe(true);
  await expect(
    managed.issueToken({ tokenName: "wrong-app-token", application: "other", identity: "runtime" }),
  ).rejects.toThrow("does not belong to application");
  await expect(managed.issueToken({ tokenName: "global-token" })).rejects.toThrow(
    "application is invalid",
  );
});
