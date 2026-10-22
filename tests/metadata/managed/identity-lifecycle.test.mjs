import { createManagedMetadataForTest } from "../../../test-fixtures/managed-metadata.mjs";
import { expect, test } from "@jest/globals";
import { createManagedIdentityLifecycle } from "../../../src/metadata/managed/identity-lifecycle.mjs";
import { createSecretBox } from "../../../src/metadata/secret-box.mjs";

test("creates managed identity lifecycle operations", () => {
  const lifecycle = createManagedIdentityLifecycle({
    query: async () => [[]],
    q: async () => [[]],
  });
  expect(Object.keys(lifecycle)).toEqual([
    "createIdentity",
    "listIdentities",
    "revokeIdentity",
    "rotateIdentity",
  ]);
});

test("rotates and revokes an identity only within its application", async () => {
  const queries = [];
  const lifecycle = createManagedIdentityLifecycle({
    query: async () => [[]],
    q: async (sql) => {
      queries.push(sql);
      return sql.startsWith("SELECT username") ? [[{ username: "payments_runtime" }]] : [[]];
    },
    box: createSecretBox("test-key"),
  });
  await lifecycle.rotateIdentity({ identity: "runtime", application: "payments" });
  await lifecycle.revokeIdentity({ identity: "runtime", application: "payments" });
  expect(
    queries
      .filter((sql) => sql.includes("WHERE name="))
      .every((sql) => sql.includes("application_name='payments'")),
  ).toBe(true);
});

test("requires an application when rotating or revoking an identity", async () => {
  const lifecycle = createManagedIdentityLifecycle({
    query: async () => [[]],
    q: async () => [[]],
  });
  await expect(lifecycle.rotateIdentity()).rejects.toMatchObject({ statusCode: 400 });
  await expect(lifecycle.revokeIdentity()).rejects.toMatchObject({ statusCode: 400 });
});

test("normalizes array and serialized grants when listing identities", async () => {
  const managed = createManagedMetadataForTest({
    query: async () => [
      [
        { name: "array-grants", application: "payments", grants_json: ["SELECT"] },
        { name: "serialized-grants", application: "payments", grants_json: '["UPDATE"]' },
      ],
    ],
  });
  expect(await managed.listIdentities()).toEqual([
    { name: "array-grants", application: "payments", grants: ["SELECT"] },
    { name: "serialized-grants", application: "payments", grants: ["UPDATE"] },
  ]);
});
