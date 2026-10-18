import { expect, jest, test } from "@jest/globals";
import { createMariaStartupHarness as base } from "../../../test-fixtures/maria-startup-harness.mjs";
import { startSupervisorMariaDb } from "../../../src/runtime/maria/startup.mjs";
import { watchMariaDbJoinReadiness } from "../../../src/runtime/maria/join-readiness.mjs";
jest.useFakeTimers();
test("completes a join with the available Primary quorum before all members return", async () => {
  const value = {
    ...base(),
    config: { ...base().config, clusterSize: 3 },
    health: {
      status: jest.fn(async () => ({
        values: {
          wsrep_local_state_comment: "Synced",
          wsrep_ready: "ON",
          wsrep_cluster_status: "Primary",
          wsrep_cluster_size: "2",
        },
      })),
    },
    startupDecision: {
      mode: "join",
      bootstrapComplete: true,
      reason: "explicit join initialization handoff",
    },
    createWatch: jest.fn((options) => {
      expect(
        options.isReady({
          values: {
            wsrep_local_state_comment: "Synced",
            wsrep_ready: "ON",
            wsrep_cluster_status: "Primary",
            wsrep_cluster_size: "2",
          },
        }),
      ).toBe(true);
      return async () => ({ ready: true });
    }),
    processController: { start: jest.fn(() => Promise.resolve()), stop: jest.fn() },
  };
  startSupervisorMariaDb(value);
  await jest.advanceTimersByTimeAsync(0);
  expect(value.recoveryState.set).toHaveBeenCalledWith(
    "complete",
    expect.objectContaining({ reason: expect.stringContaining("join completed") }),
  );
});
test("leaves join state pending when readiness times out", async () => {
  const value = {
    ...base(),
    startupDecision: { mode: "join", bootstrapComplete: true },
    createWatch: jest.fn(() => async () => ({ ready: false })),
  };
  startSupervisorMariaDb(value);
  await jest.advanceTimersByTimeAsync(0);
  expect(value.recoveryState.set).toHaveBeenCalledWith("joining", expect.any(Object));
  expect(value.recoveryState.set).not.toHaveBeenCalledWith("complete", expect.anything());
});
test("quarantines a joiner when the readiness watch times out", async () => {
  let options;
  const value = {
    ...base(),
    startupDecision: { mode: "join", bootstrapComplete: true },
    createWatch: jest.fn((received) => {
      options = received;
      return async () => {
        await received.onTimeout();
        return { ready: false, timedOut: true };
      };
    }),
  };
  startSupervisorMariaDb(value);
  await jest.advanceTimersByTimeAsync(0);
  expect(value.recoveryState.set).toHaveBeenCalledWith(
    "cluster-unavailable",
    expect.objectContaining({ reason: expect.stringContaining("join") }),
  );
  expect(value.processController.stop).toHaveBeenCalled();
  expect(value.recoveryAudit.failure).toHaveBeenCalled();
  expect(options).toBeDefined();
});
test("accepts a late readiness result only after fresh health confirmation", async () => {
  const value = {
    ...base(),
    health: {
      status: jest.fn(async () => ({
        values: {
          wsrep_local_state_comment: "Synced",
          wsrep_ready: "ON",
          wsrep_cluster_status: "Primary",
          wsrep_cluster_size: "2",
        },
      })),
    },
    startupDecision: { mode: "join", bootstrapComplete: true },
    createWatch: jest.fn((options) => async () => {
      await options.onTimeout();
      return { ready: true };
    }),
  };
  startSupervisorMariaDb(value);
  await jest.advanceTimersByTimeAsync(0);
  expect(value.recoveryState.set).toHaveBeenCalledWith("cluster-unavailable", expect.any(Object));
  expect(value.recoveryState.set).toHaveBeenCalledWith("complete", expect.any(Object));
});
test("does not accept a late readiness result when fresh health is unavailable", async () => {
  const value = {
    ...base(),
    health: {
      status: jest.fn(async () => {
        throw new Error("database unavailable");
      }),
    },
    startupDecision: { mode: "join", bootstrapComplete: true },
    createWatch: jest.fn((options) => async () => {
      await options.onTimeout();
      return { ready: true };
    }),
  };
  startSupervisorMariaDb(value);
  await jest.advanceTimersByTimeAsync(0);
  expect(value.recoveryState.set).not.toHaveBeenCalledWith("complete", expect.anything());
});
test("does not stop a normal rejoin while Galera state transfer is pending", async () => {
  const value = {
    ...base(),
    startupDecision: { mode: "rejoin", bootstrapComplete: true },
    createWatch: jest.fn((received) => async () => {
      await received.onTimeout();
      return { ready: false, timedOut: true };
    }),
  };
  startSupervisorMariaDb(value);
  await jest.advanceTimersByTimeAsync(0);
  expect(value.processController.start).toHaveBeenCalled();
  expect(value.processController.stop).not.toHaveBeenCalled();
});
test("records a join readiness watcher failure", async () => {
  const value = {
    ...base(),
    startupDecision: { mode: "join", bootstrapComplete: true },
    createWatch: jest.fn(() => async () => {
      throw new Error("join watcher failed");
    }),
  };
  startSupervisorMariaDb(value);
  await jest.advanceTimersByTimeAsync(0);
  expect(value.recoveryState.set).toHaveBeenCalledWith(
    "cluster-unavailable",
    expect.objectContaining({ reason: "join watcher failed" }),
  );
  expect(value.recoveryAudit.failure).toHaveBeenCalled();
  expect(value.log.error).toHaveBeenCalled();
});
test("starts a join readiness watch", () => {
  const value = base();
  const createWatch = jest.fn(() => () => Promise.resolve({ ready: false }));
  watchMariaDbJoinReadiness({
    createWatch,
    health: value.health,
    config: value.config,
    startupDecision: value.startupDecision,
    generation: 1,
    recoveryState: value.recoveryState,
    recoveryAudit: value.recoveryAudit,
    processController: value.processController,
    log: value.log,
    identity: value.identity,
    isCurrent: () => true,
  });
  expect(createWatch).toHaveBeenCalled();
});
