import { expect, jest, test } from "@jest/globals";
import {
  captured,
  defaultResult,
  dependencies,
  setRecoveryResult,
  setRuntimeFailure,
  setProcessFailure,
  getRecoveryResult,
  startSupervisor,
} from "../../../test-fixtures/startup-coordinator-harness.mjs";
await import("../../../src/runtime/startup/coordinator.mjs");
test("blocked initialized startup wires recovery readiness and completion handoffs", async () => {
  const onRecoveryComplete = jest.fn();
  await expect(startSupervisor({ ...dependencies(), onRecoveryComplete })).resolves.toEqual({
    pending: true,
  });
  expect(captured.pending.recoveryRequired).toBe(true);
  expect(captured.pending.recoveryProtocol).toBeDefined();
  expect(captured.pending.onRecoveryComplete).toBe(onRecoveryComplete);
  await captured.pending.onRecoveryBootstrap({
    epoch: 7,
    winner: { node: "node-a.example.test" },
    clusterId: "cluster-a",
    quorum: ["node-a.example.test", "node-b.example.test"],
  });
  expect(captured.pending.recoveryProtocol.complete).not.toHaveBeenCalled();
  await captured.pending.onRecoveryComplete({ epoch: 7, phase: "complete" });
  expect(onRecoveryComplete).toHaveBeenCalledWith({ epoch: 7, phase: "complete" });
});

test("starts the local recovery winner and runtime after authorized bootstrap", async () => {
  setRecoveryResult(defaultResult());
  getRecoveryResult().startupServer = { close: jest.fn() };
  const state = { mariaProcess: {} };
  const recoverTraffic = jest.fn().mockResolvedValue(undefined);
  const result = await startSupervisor({ ...dependencies(), state, recoverTraffic });
  await captured.pending.onRecoveryBootstrap({
    epoch: 8,
    winner: { node: "node-a.example.test" },
    clusterId: "cluster-a",
    quorum: ["node-a.example.test", "node-b.example.test"],
  });
  expect(captured.processController.start).toHaveBeenCalledWith(
    expect.arrayContaining(["--wsrep-new-cluster"]),
  );
  expect(captured.pendingRuntime.shutdown).toHaveBeenCalledTimes(1);
  expect(getRecoveryResult().startupServer.close).toHaveBeenCalledTimes(1);
  expect(recoverTraffic).toHaveBeenCalledTimes(1);
  await captured.pending.onRecoveryBootstrap({
    epoch: 8,
    winner: { node: "node-a.example.test" },
    clusterId: "cluster-a",
    quorum: ["node-a.example.test", "node-b.example.test"],
  });
  expect(captured.pendingRuntime.shutdown).toHaveBeenCalledTimes(1);
  expect(getRecoveryResult().startupServer.close).toHaveBeenCalledTimes(1);
  expect(result).toEqual({ pending: true });
});

test("keeps a non-winning recovery node in pending mode", async () => {
  setRecoveryResult(defaultResult());
  const state = { mariaProcess: {} };
  const onRecoveryBootstrap = jest.fn().mockResolvedValue(false);
  await startSupervisor({ ...dependencies(), state, onRecoveryBootstrap });
  await captured.pending.onRecoveryBootstrap({ epoch: 9, winner: { node: "node-b.example.test" } });
  expect(captured.processController.start).not.toHaveBeenCalled();
  expect(onRecoveryBootstrap).toHaveBeenCalled();
});

test("runs the joiner coordinator only after local winner runtime startup", async () => {
  setRecoveryResult(defaultResult());
  const recoverJoiners = jest.fn().mockResolvedValue(undefined);
  await startSupervisor({ ...dependencies(), state: { mariaProcess: {} }, recoverJoiners });
  await captured.pending.onRecoveryBootstrap({
    epoch: 15,
    winner: { node: "node-a.example.test" },
    clusterId: "cluster-a",
  });
  expect(recoverJoiners).toHaveBeenCalledWith(
    expect.objectContaining({
      bootstrap: expect.objectContaining({ epoch: 15 }),
      runtime: expect.any(Object),
    }),
  );
});

test("does not run the joiner coordinator on a non-winning node", async () => {
  setRecoveryResult(defaultResult());
  const recoverJoiners = jest.fn();
  captured.runtimeOptions = undefined;
  await startSupervisor({ ...dependencies(), state: { mariaProcess: {} }, recoverJoiners });
  await captured.pending.onRecoveryBootstrap({
    epoch: 16,
    winner: { node: "node-b.example.test" },
  });
  expect(recoverJoiners).not.toHaveBeenCalled();
  expect(captured.runtimeOptions).toBeUndefined();
});

test("wires an authenticated join request to join startup and runtime", async () => {
  setRecoveryResult(defaultResult());
  await startSupervisor({ ...dependencies(), state: { mariaProcess: {} } });
  captured.processController.start.mockClear();
  await expect(
    captured.pending.onRecoveryJoin({
      winnerAddress: "node-a.example.test",
      epoch: 17,
      clusterId: "cluster-a",
      quorum: ["node-a.example.test", "node-b.example.test"],
    }),
  ).resolves.toMatchObject({ node: "node-a.example.test", status: "ready" });
  expect(captured.processController.start).toHaveBeenCalledWith(
    expect.arrayContaining(["--wsrep-cluster-address=gcomm://node-a.example.test"]),
  );
  expect(captured.runtimeOptions.startupDecision).toMatchObject({
    mode: "join",
    bootstrapComplete: true,
    epoch: 17,
  });
});

test("propagates runtime startup failures after recovery handoff", async () => {
  setRecoveryResult(defaultResult());
  setRuntimeFailure(new Error("runtime start failed"));
  const state = { mariaProcess: {} };
  await startSupervisor({ ...dependencies(), state });
  await expect(
    captured.pending.onRecoveryBootstrap({ epoch: 10, winner: { node: "node-a.example.test" } }),
  ).rejects.toThrow("runtime start failed");
  setRuntimeFailure(undefined);
});

test("propagates MariaDB process-start failures during recovery handoff", async () => {
  setRecoveryResult(defaultResult());
  setProcessFailure(new Error("mariadbd start failed"));
  await startSupervisor({ ...dependencies(), state: { mariaProcess: {} } });
  await expect(
    captured.pending.onRecoveryBootstrap({ epoch: 11, winner: { node: "node-a.example.test" } }),
  ).rejects.toThrow("mariadbd start failed");
  setProcessFailure(undefined);
});

test("propagates recovery callback failures after runtime startup", async () => {
  setRecoveryResult(defaultResult());
  const callbackFailure = new Error("recovery callback failed");
  await startSupervisor({
    ...dependencies(),
    state: { mariaProcess: {} },
    onRecoveryBootstrap: jest.fn().mockRejectedValue(callbackFailure),
  });
  await expect(
    captured.pending.onRecoveryBootstrap({ epoch: 12, winner: { node: "node-a.example.test" } }),
  ).rejects.toThrow("recovery callback failed");
});
