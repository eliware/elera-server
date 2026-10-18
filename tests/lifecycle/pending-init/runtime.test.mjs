import { expect, test } from "@jest/globals";
import "../../../test-fixtures/suites/pending-init-runtime.mjs";
import { startPendingInitRuntime } from "../../../src/lifecycle/pending-init/runtime.mjs";

test("loads the startPendingInitRuntime suite", () => {
  expect(typeof startPendingInitRuntime).toBe("function");
});
