import { expect, test } from "@jest/globals";
import { isEvidenceFqdn } from "../../../../src/cluster/cold-bootstrap/evidence/fqdn.mjs";

test("accepts valid FQDN evidence identities", () => {
  expect(isEvidenceFqdn("node-1.example.test")).toBe(true);
  expect(isEvidenceFqdn("node.example.test")).toBe(true);
});

test("rejects invalid FQDN evidence identities", () => {
  for (const value of [undefined, 3, "node", "bad_.example.test", "-bad.example.test"])
    expect(isEvidenceFqdn(value)).toBe(false);
});
