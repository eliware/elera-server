import { expect, jest, test } from "@jest/globals";

const captured = {};
jest.unstable_mockModule("../../../src/runtime/control/composition.mjs", () => ({
  createSupervisorControlComposition: jest.fn((options) => {
    captured.control = options;
    return { handler: jest.fn() };
  }),
}));
jest.unstable_mockModule("../../../src/runtime/probe-wiring.mjs", () => ({
  createSupervisorProbes: jest.fn((options) => {
    captured.probes = options;
    return { ready: true };
  }),
}));
const { createSupervisorEntryWiring } = await import("../../../src/runtime/entry/wiring.mjs");

test("wires control and probe services to live recovery state", async () => {
  const protocol = { status: jest.fn(async () => "ready") };
  const services = {
    health: { status: jest.fn() },
    domain: { intentState: {} },
    routing: { routingBundles: {}, routingEvent: {} },
    routingStream: { upgrade: jest.fn() },
    traffic: { clusterDrain: {}, drain: { isDraining: jest.fn(() => false) } },
    coldEvidence: "evidence",
    telemetry: {},
  };
  let coldState = { drain: {}, clusterDrain: {}, coldEvidence: null };
  const getColdState = jest.fn(() => ({ ...coldState, coldRecoveryProtocol: protocol }));
  const result = createSupervisorEntryWiring({
    services,
    recovery: {},
    lifecycle: { get: () => "running" },
    config: { startupTimeoutMs: 10 },
    identity: { name: "node.example.test" },
    getColdState,
    applyIntent: jest.fn(),
    environment: {},
    log: {},
    getDb: () => undefined,
    getMariaProcess: () => ({ start: jest.fn(), stop: jest.fn() }),
  });
  expect(captured.control.coldState.coldEvidence).toBe("evidence");
  await expect(captured.control.getColdRecoveryProtocol().status()).resolves.toBe("ready");
  captured.control.processController.start();
  captured.control.processController.stop();
  expect(captured.probes.getStatus).toBeDefined();
  captured.probes.getStatus();
  captured.probes.isDraining();
  captured.probes.isShuttingDown();
  captured.probes.controlHandler({}, {});
  captured.probes.upgradeHandler({}, {}, {});
  expect(result.probes).toEqual({ ready: true });
  coldState = { drain: {}, clusterDrain: {}, coldEvidence: "saved" };
  createSupervisorEntryWiring({
    services,
    recovery: {},
    lifecycle: { get: () => "running" },
    config: {},
    identity: { name: "node.example.test" },
    getColdState,
    applyIntent: () => {},
    environment: {},
    log: {},
    getDb: () => undefined,
    getMariaProcess: () => ({}),
  });
  expect(captured.control.coldState.coldEvidence).toBe("saved");
});
