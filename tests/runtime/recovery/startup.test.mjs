import { expect, test } from "@jest/globals";
import "../../../test-fixtures/suites/recovery-startup.mjs";
const { prepareSupervisorRecovery } = await import("../../../src/runtime/recovery/startup.mjs");

test("loads the prepareSupervisorRecovery suite", () => {
  expect(typeof prepareSupervisorRecovery).toBe("function");
});
