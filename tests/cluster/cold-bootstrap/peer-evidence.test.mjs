import { expect, test } from "@jest/globals";
import "../../../test-fixtures/suites/peer-evidence.mjs";
import { createColdBootstrapEvidence } from "../../../src/cluster/cold-bootstrap/peer-evidence.mjs";

test("loads the cold bootstrap evidence factory", () => {
  expect(createColdBootstrapEvidence).toEqual(expect.any(Function));
});
