import { expect, jest, test } from "@jest/globals";

const startProcess = jest.fn();
jest.unstable_mockModule("../../../src/runtime/recovery/process-start.mjs", () => ({
  startAuthorizedRecoveryProcess: startProcess,
}));
const { executeAuthorizedRecoveryBootstrap } =
  await import("../../../src/runtime/startup/bootstrap-execution.mjs");

test("stops after a node loses the recovery election", async () => {
  startProcess.mockResolvedValueOnce(false);
  const close = jest.fn();
  await expect(
    executeAuthorizedRecoveryBootstrap({
      bootstrap: {},
      state: {},
      closeTemporaryListeners: close,
      log: {},
    }),
  ).resolves.toBe(false);
  expect(close).not.toHaveBeenCalled();
});

test("starts joiners and traffic after the elected node starts", async () => {
  startProcess.mockResolvedValueOnce(true);
  const close = jest.fn();
  const startRuntime = jest.fn(async () => ({ ready: true }));
  const recoverJoiners = jest.fn();
  const recoverTraffic = jest.fn();
  const callback = jest.fn();
  await executeAuthorizedRecoveryBootstrap({
    bootstrap: { epoch: 4 },
    state: {},
    closeTemporaryListeners: close,
    startRuntime,
    members: [{ name: "node-a.example.test" }],
    recoverJoiners,
    recoverTraffic,
    onRecoveryBootstrap: callback,
    log: { debug: jest.fn() },
  });
  expect(close).toHaveBeenCalledTimes(1);
  expect(recoverJoiners).toHaveBeenCalledWith({
    bootstrap: { epoch: 4 },
    members: [{ name: "node-a.example.test" }],
    runtime: { ready: true },
  });
  expect(recoverTraffic).toHaveBeenCalledTimes(1);
  expect(callback).toHaveBeenCalledWith({ epoch: 4 });
});
