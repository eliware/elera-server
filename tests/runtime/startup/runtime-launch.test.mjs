import { expect, jest, test } from "@jest/globals";
import {
  captured,
  defaultResult,
  dependencies,
  setRecoveryResult,
  startSupervisor,
} from "../../../test-fixtures/startup-coordinator-harness.mjs";
await import("../../../src/runtime/startup/runtime-launch.mjs");
await import("../../../src/runtime/startup/coordinator.mjs");
test("starts normal non-blocked startup without the pending recovery listener", async () => {
  setRecoveryResult({
    ...defaultResult(),
    startupDecision: { mode: "join", reason: "active peer" },
  });
  const deps = dependencies();
  deps.environment = undefined;
  await expect(startSupervisor(deps)).resolves.toBeUndefined();
  expect(captured.pending).toBeUndefined();
});

test("clears propagated cluster drain after normal rejoin startup", async () => {
  setRecoveryResult({
    ...defaultResult(),
    startupDecision: { mode: "rejoin", reason: "persisted member rejoin" },
  });
  const recoverTraffic = jest.fn().mockResolvedValue(undefined);
  await expect(startSupervisor({ ...dependencies(), recoverTraffic })).resolves.toBeUndefined();
  expect(recoverTraffic).toHaveBeenCalledTimes(1);
  expect(captured.runtimeOptions.startupDecision).toMatchObject({ mode: "rejoin" });
});

test("awaits the shared HTTP listener before recovery preparation", async () => {
  setRecoveryResult({
    ...defaultResult(),
    startupDecision: { mode: "join", reason: "active peer" },
  });
  const order = [];
  const deps = dependencies();
  deps.probes = {
    start: jest.fn(async (_port, _host, callback) => {
      order.push("listener");
      callback();
    }),
  };
  const { prepareSupervisorRecovery } = await import("../../../src/runtime/recovery/startup.mjs");
  await startSupervisor(deps);
  expect(prepareSupervisorRecovery).toHaveBeenCalledWith(
    expect.objectContaining({ probes: deps.probes }),
  );
});

test("starts ordinary local bootstrap and records its initial recovery state", async () => {
  setRecoveryResult({
    ...defaultResult(),
    startupDecision: {
      mode: "bootstrap",
      localWinner: true,
      epoch: 13,
      recoveryEpoch: {
        clusterId: "cluster-a",
        quorum: ["node-a.example.test", "node-b.example.test"],
      },
    },
  });
  const deps = dependencies();
  await expect(startSupervisor(deps)).resolves.toBeUndefined();
  expect(deps.recoveryState.set).toHaveBeenCalledWith("bootstrapping", { epoch: 13 });
  expect(deps.state.routingTimer).toBe("routing");
  expect(deps.state.peerTimer).toBe("peer");
});

test("wires cold-bootstrap and startup-service callbacks", async () => {
  setRecoveryResult({
    ...defaultResult(),
    startupDecision: { mode: "join", reason: "active peer" },
  });
  const deps = dependencies();
  deps.state.restarting = false;
  deps.state.shuttingDown = false;
  await startSupervisor(deps);
  expect(captured.coldBootstrap.bootstrapLocal()).toBeUndefined();
  captured.startupServices.setRestarting(true);
  expect(deps.state.restarting).toBe(true);
  expect(captured.startupServices.isRestarting()).toBe(true);
  captured.startupServices.setRestarting(false);
  expect(captured.startupServices.isRestarting()).toBe(false);
  expect(deps.state.db).toEqual({ connected: true });
  captured.startupServices.loadIntent();
  captured.startupServices.intentState.apply({ apiVersion: "v1" });
  expect(captured.startupServices.shuttingDown()).toBe(false);
  const exit = jest.spyOn(process, "exit").mockImplementation(() => {});
  captured.startupServices.onFatal();
  captured.startupServices.onFatal(7);
  expect(exit).toHaveBeenCalledWith(1);
  expect(exit).toHaveBeenCalledWith(7);
  exit.mockRestore();
});
