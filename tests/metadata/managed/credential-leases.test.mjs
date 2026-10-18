import { expect, test } from "@jest/globals";
import { createManagedCredentialLeases } from "../../../src/metadata/managed/credential-leases.mjs";

test("creates credential lease operations", () => {
  const leases = createManagedCredentialLeases({ q: async () => [[]], box: null, identity: {} });
  expect(Object.keys(leases)).toEqual(["lease"]);
});
