import { expect, jest, test } from "@jest/globals";
import {
  captured,
  defaultResult,
  dependencies,
  setRecoveryResult,
  startSupervisor,
} from "../../../test-fixtures/startup-coordinator-harness.mjs";
const { startPendingSupervisorRecovery } =
  await import("../../../src/runtime/startup/pending-init-launch.mjs");
await import("../../../src/runtime/startup/coordinator.mjs");

test("starts pending recovery with callbacks and initialized data state", async () => {
  let options;
  const result = await startPendingSupervisorRecovery({
    startPendingRuntime: async (value) => {
      options = value;
      return { shutdown: jest.fn() };
    },
    startupDecision: { reason: "need recovery" },
    startupServer: { close: jest.fn() },
    config: { dataDir: "/data", httpPort: 8080 },
    state: { coldRecoveryProtocol: {} },
    inspectDataDirectory: () => ({ action: "start" }),
    identity: { name: "node-a.example.test" },
    args: [],
    recoveryState: {},
    recoveryAudit: {},
    recoveryResult: { members: [] },
    runtimeInputs: {},
    recoverJoiners: jest.fn(),
    recoverTraffic: jest.fn(),
    onRecoveryBootstrap: jest.fn(),
    onRecoveryComplete: jest.fn(),
    environment: {},
    log: { warn: jest.fn() },
  });
  expect(result).toEqual({ pending: true });
  expect(options.recoveryRequired).toBe(true);
  expect(options.onRecoveryBootstrap).toEqual(expect.any(Function));
  expect(options.onRecoveryJoin).toEqual(expect.any(Function));
});

test("invokes the default recovery bootstrap callback during local recovery", async () => {
  setRecoveryResult(defaultResult());
  await expect(
    startSupervisor({ ...dependencies(), state: { mariaProcess: {} } }),
  ).resolves.toEqual({ pending: true });
  await captured.pending.onRecoveryBootstrap({
    epoch: 14,
    winner: { node: "node-a.example.test" },
  });
  expect(captured.processController.start).toHaveBeenCalled();
});

test("invokes the default recovery completion callback in pending mode", async () => {
  setRecoveryResult(defaultResult());
  await expect(
    startSupervisor({ ...dependencies(), state: { mariaProcess: {} } }),
  ).resolves.toEqual({ pending: true });
  await expect(captured.pending.onRecoveryComplete({ phase: "complete" })).resolves.toBeUndefined();
});
