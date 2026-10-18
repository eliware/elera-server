import { expect, test } from "@jest/globals";
import "../../../../test-fixtures/suites/recovery-join-wiring.mjs";
import { createSupervisorRecoveryJoiner } from "../../../../src/runtime/recovery/join/wiring.mjs";

test("loads the createSupervisorRecoveryJoiner suite", () => {
  expect(typeof createSupervisorRecoveryJoiner).toBe("function");
});
