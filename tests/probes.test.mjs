import { expect, test } from "@jest/globals";
import "../test-fixtures/suites/probes.mjs";
import { createProbeServer } from "../src/probes.mjs";

test("loads the createProbeServer suite", () => {
  expect(typeof createProbeServer).toBe("function");
});
