import { expect, jest, test } from "@jest/globals";

const captured = {};
jest.unstable_mockModule("../../../src/health.mjs", () => ({
  createHealthService: jest.fn((options) => {
    captured.health = options;
    return { status: jest.fn(), cacheInfo: jest.fn() };
  }),
}));
jest.unstable_mockModule("../../../src/runtime/composition.mjs", () => ({
  createSupervisorComposition: jest.fn((options) => {
    captured.domain = options;
    return {
      observationStore: {},
      managed: { authenticate: jest.fn(async () => ({ application: "app" })) },
    };
  }),
}));
jest.unstable_mockModule("../../../src/runtime/routing/composition.mjs", () => ({
  createRoutingComposition: jest.fn((options) => {
    captured.routing = options;
    return { routingEvent: {}, routingBus: {}, routingBundles: {} };
  }),
}));
jest.unstable_mockModule("../../../src/api/routing/stream.mjs", () => ({
  createRoutingStream: jest.fn((options) => {
    captured.stream = options;
    return { upgrade: jest.fn() };
  }),
}));
jest.unstable_mockModule("../../../src/runtime/traffic/wiring.mjs", () => ({
  createSupervisorTraffic: jest.fn((options) => {
    captured.traffic = options;
    return { drain: { isDraining: jest.fn() }, clusterDrain: {}, sqlQuiesce: {} };
  }),
}));
jest.unstable_mockModule("../../../src/cluster/cold-bootstrap/peer-evidence.mjs", () => ({
  createColdBootstrapEvidence: jest.fn(() => ({ local: "evidence" })),
}));
const { createSupervisorEntryServices } = await import("../../../src/runtime/entry/services.mjs");

test("builds entry services and forwards database, address, and auth calls", async () => {
  const database = { query: jest.fn(), health: jest.fn() };
  const telemetry = { summary: jest.fn(), details: jest.fn() };
  const services = createSupervisorEntryServices({
    config: { dataDir: "/data", timeoutMs: 10, elera: true, clusterSize: 3 },
    identity: { name: "node.example.test" },
    telemetry,
    recoveryState: { snapshot: jest.fn() },
    log: {},
    environment: { ROOT_TOKEN: "root" },
    getDb: () => database,
    setDrained: jest.fn(),
    getDrained: jest.fn(() => false),
  });
  captured.health.db.query("sql");
  captured.health.db.health("sql");
  captured.health.getTelemetry();
  captured.health.getRecoveryState();
  captured.domain.query("sql");
  captured.routing.query("sql");
  await captured.routing.resolveAddress("localhost");
  captured.routing.getDrained();
  expect(await captured.stream.authorize()).toBe(false);
  expect(await captured.stream.authorize("root", "app")).toBe(true);
  expect(await captured.stream.authorize("managed", "app")).toEqual({ application: "app" });
  expect(await captured.stream.authorize("managed", "other")).toBe(false);
  expect(services.coldEvidence).toBe("evidence");
  expect(services.traffic).toBeDefined();
});

test("uses the configured routing event version path", () => {
  createSupervisorEntryServices({
    config: { dataDir: "/data", timeoutMs: 10, elera: true, clusterSize: 3 },
    identity: { name: "node.example.test" },
    telemetry: { summary: () => ({}), details: () => ({}) },
    recoveryState: { snapshot: () => ({}) },
    log: {},
    environment: { ELERA_EVENT_VERSION_PATH: "/event-versions" },
    getDb: () => undefined,
    setDrained: () => {},
    getDrained: () => false,
  });
  expect(captured.routing.environment.ELERA_EVENT_VERSION_PATH).toBe("/event-versions");
});
