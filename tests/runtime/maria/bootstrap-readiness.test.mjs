import { expect, jest, test } from "@jest/globals";
import { createMariaStartupHarness as base } from "../../../test-fixtures/maria-startup-harness.mjs";
import { startSupervisorMariaDb } from "../../../src/runtime/maria/startup.mjs";
import { watchMariaDbBootstrapReadiness } from "../../../src/runtime/maria/bootstrap-readiness.mjs";
jest.useFakeTimers();
test("uses a one-node view for explicit bootstrap readiness", async () => {
  let watchOptions;
  const value = {
    ...base(),
    config: { ...base().config, clusterSize: 3 },
    startupDecision: { mode: "bootstrap", localWinner: true, epoch: null },
    recoveryCompletion: { publish: jest.fn() },
    coldRecoveryProtocol: { complete: jest.fn() },
    createWatch: jest.fn((options) => {
      watchOptions = options;
      return async () => ({ ready: true });
    }),
    processController: { start: jest.fn(() => Promise.resolve()), stop: jest.fn() },
  };
  startSupervisorMariaDb(value);
  await jest.advanceTimersByTimeAsync(0);
  expect(
    watchOptions.isReady({
      values: {
        wsrep_local_state_comment: "Synced",
        wsrep_ready: "ON",
        wsrep_cluster_status: "Primary",
        wsrep_cluster_size: "1",
      },
    }),
  ).toBe(true);
  expect(
    watchOptions.isReady({
      values: {
        wsrep_local_state_comment: "Synced",
        wsrep_ready: "ON",
        wsrep_cluster_status: "Primary",
        wsrep_cluster_size: "3",
      },
    }),
  ).toBe(false);
});
test("completes explicit bootstrap locally after expected membership is ready", async () => {
  const value = {
    ...base(),
    config: { ...base().config, clusterSize: 3 },
    startupDecision: { mode: "bootstrap", localWinner: true, epoch: null },
    coldRecoveryProtocol: { complete: jest.fn() },
    createWatch: jest.fn(() => async () => ({ ready: true })),
  };
  startSupervisorMariaDb(value);
  await jest.advanceTimersByTimeAsync(0);
  expect(value.coldRecoveryProtocol.complete).not.toHaveBeenCalled();
  expect(value.recoveryState.set).toHaveBeenCalledWith(
    "complete",
    expect.objectContaining({ reason: expect.stringContaining("explicit bootstrap") }),
  );
});
test("starts a joining member and records the transition", async () => {
  const value = base();
  startSupervisorMariaDb({ ...value, shouldStart: () => true });
  await jest.advanceTimersByTimeAsync(0);
  expect(value.recoveryState.set).toHaveBeenCalledWith(
    "joining",
    expect.objectContaining({ reason: "join", generation: expect.anything(), epoch: 1 }),
  );
  expect(value.recoveryAudit.joinStart).toHaveBeenCalled();
});
test("handles bootstrap watch timeout and completion", async () => {
  let watchOptions;
  const value = {
    ...base(),
    startupDecision: {
      mode: "bootstrap",
      localWinner: true,
      epoch: 2,
      recoveryEpoch: { clusterId: "c", quorum: ["a", "b", "c"] },
    },
    recoveryCompletion: { publish: jest.fn() },
    startupServer: { close: jest.fn() },
    coldRecoveryProtocol: { complete: jest.fn() },
    createWatch: jest.fn((options) => {
      watchOptions = options;
      options.onTimeout();
      return async () => ({ ready: true });
    }),
  };
  startSupervisorMariaDb({ ...value, shouldStart: () => true });
  await jest.advanceTimersByTimeAsync(0);
  expect(
    watchOptions.isReady({
      values: {
        wsrep_local_state_comment: "Synced",
        wsrep_ready: "ON",
        wsrep_cluster_status: "Primary",
        wsrep_cluster_size: "1",
      },
    }),
  ).toBe(true);
  expect(
    watchOptions.isReady({
      values: {
        wsrep_local_state_comment: "Synced",
        wsrep_ready: "ON",
        wsrep_cluster_status: "Primary",
        wsrep_cluster_size: "0",
      },
    }),
  ).toBe(false);
  expect(value.recoveryAudit.failure).toHaveBeenCalled();
  expect(value.coldRecoveryProtocol.complete).toHaveBeenCalled();
  expect(value.recoveryState.set).toHaveBeenCalledWith("complete", expect.any(Object));
});
test("completes recovered bootstrap without an optional completion publisher", async () => {
  const value = {
    ...base(),
    startupDecision: {
      mode: "bootstrap",
      localWinner: true,
      epoch: 4,
      recoveryEpoch: { clusterId: "c", quorum: ["a"] },
    },
    coldRecoveryProtocol: { complete: jest.fn() },
    createWatch: jest.fn(() => async () => ({ ready: true })),
  };
  startSupervisorMariaDb(value);
  await jest.advanceTimersByTimeAsync(0);
  expect(value.coldRecoveryProtocol.complete).toHaveBeenCalledWith(
    expect.objectContaining({ epoch: 4 }),
  );
});
test("records a bootstrap readiness watcher failure", async () => {
  const value = {
    ...base(),
    startupDecision: { mode: "bootstrap", localWinner: true },
    createWatch: jest.fn(() => async () => {
      throw new Error("bootstrap watcher failed");
    }),
  };
  startSupervisorMariaDb(value);
  await jest.advanceTimersByTimeAsync(0);
  expect(value.recoveryState.set).toHaveBeenCalledWith(
    "cluster-unavailable",
    expect.objectContaining({ reason: "bootstrap watcher failed" }),
  );
  expect(value.recoveryAudit.failure).toHaveBeenCalled();
  expect(value.log.error).toHaveBeenCalled();
});
test("uses the configured cluster size when recovery quorum is absent", async () => {
  const value = {
    ...base(),
    config: { ...base().config, clusterSize: 3 },
    startupDecision: { mode: "bootstrap", localWinner: true, epoch: 5, recoveryEpoch: {} },
    createWatch: jest.fn(() => async () => ({ ready: false })),
  };
  startSupervisorMariaDb(value);
  await jest.advanceTimersByTimeAsync(0);
  expect(value.recoveryState.set).not.toHaveBeenCalledWith("complete", expect.anything());
});
test("starts a bootstrap readiness watch", () => {
  const value = base();
  const createWatch = jest.fn(() => () => Promise.resolve({ ready: false }));
  watchMariaDbBootstrapReadiness({
    createWatch,
    health: value.health,
    config: value.config,
    startupDecision: { mode: "bootstrap", localWinner: true },
    generation: 1,
    recoveryState: value.recoveryState,
    recoveryAudit: value.recoveryAudit,
    recoveryCompletion: value.recoveryCompletion,
    coldRecoveryProtocol: {},
    processController: value.processController,
    startupServer: undefined,
    log: value.log,
    identity: value.identity,
    isCurrent: () => true,
  });
  expect(createWatch).toHaveBeenCalled();
});
