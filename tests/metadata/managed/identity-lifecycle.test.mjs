import { createManagedMetadataForTest } from "../../../test-fixtures/managed-metadata.mjs";
import { expect, test } from "@jest/globals";
import { createManagedIdentityLifecycle } from "../../../src/metadata/managed/identity-lifecycle.mjs";

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
