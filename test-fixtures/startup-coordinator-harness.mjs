import { jest } from "@jest/globals";

export const captured = {};
export const defaultResult = () => ({
  initialIntent: {
    cluster: { members: [{ name: "node-a.example.test" }, { name: "node-b.example.test" }] },
  },
  args: ["--datadir=/data"],
  localEvidence: { local: {} },
  members: [{ name: "node-a.example.test" }, { name: "node-b.example.test" }],
  startupDecision: { mode: "blocked", reason: "all nodes require recovery" },
  coldRecoveryProtocol: { complete: jest.fn() },
  recoveryCompletion: {},
});
let recoveryResult = defaultResult();
let runtimeFailure;
let processFailure;
jest.unstable_mockModule("../src/runtime/startup/configuration.mjs", () => ({
  loadSupervisorStartupConfiguration: jest.fn(async () => ({
    initialIntent: {
      cluster: { members: [{ name: "node-a.example.test" }, { name: "node-b.example.test" }] },
    },
    args: ["--datadir=/data"],
  })),
}));
jest.unstable_mockModule("../src/runtime/recovery/startup.mjs", () => ({
  prepareSupervisorRecovery: jest.fn(async () => recoveryResult),
}));
jest.unstable_mockModule("../src/runtime/startup/services.mjs", () => ({
  createSupervisorStartupServices: jest.fn((options) => {
    captured.startupServices = options;
    const processController = {
      start: jest.fn(async () => {
        if (processFailure) throw processFailure;
      }),
    };
    captured.processController = processController;
    return { processController };
  }),
}));
jest.unstable_mockModule("../src/runtime/cold/bootstrap-wiring.mjs", () => ({
  createSupervisorColdBootstrap: jest.fn((options) => {
    captured.coldBootstrap = options;
    return {};
  }),
}));
jest.unstable_mockModule("../src/runtime/maria/startup.mjs", () => ({
  startSupervisorMariaDb: jest.fn(),
}));
jest.unstable_mockModule("../src/runtime/runtime/start.mjs", () => ({
  startSupervisorRuntime: jest.fn(async (options) => {
    captured.runtimeOptions = options;
    if (runtimeFailure) throw runtimeFailure;
    options.setDb?.({ connected: true });
    return { db: { connected: true }, routingTimer: "routing", peerTimer: "peer" };
  }),
}));
jest.unstable_mockModule("../src/lifecycle/data/directory.mjs", () => ({
  inspectDataDirectory: jest.fn(() => ({ action: "start" })),
}));
jest.unstable_mockModule("../src/lifecycle/pending-init/runtime.mjs", () => ({
  startPendingInitRuntime: jest.fn(async (options) => {
    captured.pending = options;
    captured.pendingRuntime = { shutdown: jest.fn() };
    return captured.pendingRuntime;
  }),
}));
export const { startSupervisor } = await import("../src/runtime/startup/coordinator.mjs");
export const { prepareSupervisorRecovery } = await import("../src/runtime/recovery/startup.mjs");
export function getRecoveryResult() {
  return recoveryResult;
}
export function setRecoveryResult(value) {
  recoveryResult = value;
}
export function setRuntimeFailure(value) {
  runtimeFailure = value;
}
export function setProcessFailure(value) {
  processFailure = value;
}
export function dependencies() {
  return {
    config: { elera: true, httpPort: 8080, dataDir: "/data" },
    identity: { name: "node-a.example.test" },
    log: { info: jest.fn(), warn: jest.fn() },
    loadEnvironmentIntent: jest.fn(),
    intentState: { apply: jest.fn() },
    routingEnvironment: {},
    recoveryState: { set: jest.fn() },
    recoveryAudit: {},
    health: {},
    environment: { ROOT_TOKEN: "root" },
    dbEnv: {},
    probes: {},
    routingEvent: jest.fn(),
    routingBus: {},
    sharedRoutingAssignments: {},
    observationStore: {},
    getDrained: () => false,
    cleanRestartIntent: {},
    telemetry: { start: jest.fn() },
    state: { mariaProcess: {} },
  };
}
