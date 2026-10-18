import { expect, jest, test } from "@jest/globals";
import { createMariaStartupHarness as base } from "../../../test-fixtures/maria-startup-harness.mjs";
import { startSupervisorMariaDb as start } from "../../../src/runtime/maria/startup.mjs";
jest.useFakeTimers();
test("refuses MariaDB start without recovery authority", () => {
  const value = base();
  start({ ...value, shouldStart: () => false });
  expect(value.processController.start).not.toHaveBeenCalled();
  expect(value.log.warn).toHaveBeenCalled();
});
test("starts explicitly authorized local bootstrap", async () => {
  const value = {
    ...base(),
    startupDecision: { mode: "bootstrap", localWinner: true },
    processController: { start: jest.fn(() => Promise.resolve()), stop: jest.fn() },
  };
  start(value);
  await jest.advanceTimersByTimeAsync(0);
  expect(value.processController.start).toHaveBeenCalled();
});
test("starts an explicitly authorized join", async () => {
  const value = {
    ...base(),
    startupDecision: { mode: "join", bootstrapComplete: true },
    processController: { start: jest.fn(() => Promise.resolve()), stop: jest.fn() },
  };
  start(value);
  await jest.advanceTimersByTimeAsync(0);
  expect(value.processController.start).toHaveBeenCalled();
});
test("ignores an unsuccessful bootstrap watch and reports process-start failure", async () => {
  const value = {
    ...base(),
    startupDecision: { mode: "bootstrap", localWinner: true },
    processController: { start: jest.fn(() => Promise.resolve()), stop: jest.fn() },
    createWatch: jest.fn(() => async () => ({ ready: false })),
  };
  start({ ...value, shouldStart: () => true });
  await jest.advanceTimersByTimeAsync(0);
  expect(value.recoveryState.set).not.toHaveBeenCalledWith("complete", expect.anything());
  const failed = {
    ...base(),
    processController: { start: jest.fn(() => Promise.reject(new Error("no start"))) },
  };
  start({ ...failed, shouldStart: () => true });
  await jest.advanceTimersByTimeAsync(0);
  expect(failed.log.error).toHaveBeenCalled();
  expect(failed.signals.shutdown).toHaveBeenCalledWith("mariadbd-error");
});
