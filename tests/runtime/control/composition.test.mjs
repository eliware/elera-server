import { expect, jest, test } from "@jest/globals";
import { join } from "node:path";
import { installMemoryFileSystem } from "../../../test-fixtures/memory-filesystem.mjs";

const __memoryFs = installMemoryFileSystem(jest);
jest.unstable_mockModule("node:fs/promises", () => __memoryFs);
jest.unstable_mockModule("node:fs", () => __memoryFs);
jest.unstable_mockModule("node:os", () => ({ tmpdir: () => "/tmp" }));
const { mkdtemp, rm } = __memoryFs;
const tmpdir = () => "/tmp";

const createControlApi = jest.fn((options) => ({ options }));
jest.unstable_mockModule("../../../src/control-api.mjs", () => ({ createControlApi }));
const { createSupervisorControlComposition } =
  await import("../../../src/runtime/control/composition.mjs");

const minimumOptions = {
  db: { query: jest.fn() },
  health: { status: jest.fn() },
  clusterDrain: { set: jest.fn() },
  coldState: { clusterDrain: {}, drain: {} },
  processController: { stop: jest.fn(), start: jest.fn() },
};

test("validates control composition dependencies, identity, and runtime state", () => {
  expect(() => createSupervisorControlComposition()).toThrow("composition dependencies");
  expect(() => createSupervisorControlComposition({ ...minimumOptions, db: {} })).toThrow(
    "composition dependencies",
  );
  expect(() => createSupervisorControlComposition({ ...minimumOptions, health: {} })).toThrow(
    "composition dependencies",
  );
  expect(() => createSupervisorControlComposition({ ...minimumOptions, clusterDrain: {} })).toThrow(
    "composition dependencies",
  );
  expect(() =>
    createSupervisorControlComposition({ ...minimumOptions, coldState: { drain: {} } }),
  ).toThrow("composition dependencies");
  expect(() =>
    createSupervisorControlComposition({ ...minimumOptions, processController: {} }),
  ).toThrow("composition dependencies");
  expect(() => createSupervisorControlComposition(minimumOptions)).toThrow("valid hostname");
  expect(() =>
    createSupervisorControlComposition({ ...minimumOptions, identity: { name: "invalid" } }),
  ).toThrow("valid hostname");
  const identity = { name: "node.example.test" };
  expect(() =>
    createSupervisorControlComposition({
      ...minimumOptions,
      identity,
      config: { dataDir: "/data" },
    }),
  ).toThrow("state dependencies");
});

test("composes the control API with cluster and runtime dependencies", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "supervisor-reset-"));
  const query = jest.fn();
  const stop = jest.fn();
  const observationStore = {
    all: jest
      .fn()
      .mockImplementationOnce(() => [
        { nodeId: "donor", synced: true, primary: "Primary", health: "ok" },
        { nodeId: "ready-donor", health: "ready", primary: false },
      ])
      .mockImplementation(() => [{ node: "donor", healthy: true, primary: true }]),
  };
  const coldState = {
    drain: { isDraining: jest.fn(() => false), active: jest.fn(() => 0) },
    clusterDrain: { set: jest.fn() },
    bootstrapMaria: jest.fn(),
    coldBootstrapService: jest.fn(),
    coldEvidence: jest.fn(),
    coldRecoveryProtocol: jest.fn(),
    coldBootstrapLocal: jest.fn(),
  };
  const result = createSupervisorControlComposition({
    db: { query },
    metadata: {},
    managed: {},
    applications: {},
    reconciler: {},
    artifactStore: {},
    routingBundles: { lease: jest.fn() },
    routingEvent: jest.fn(),
    recovery: { status: jest.fn(() => ({})) },
    observationStore,
    health: { status: jest.fn(async () => ({ ready: false })), cacheInfo: jest.fn(() => ({})) },
    clusterDrain: { set: jest.fn() },
    lifecycle: { get: jest.fn() },
    telemetry: { summary: jest.fn(), details: jest.fn() },
    config: {
      elera: true,
      runtimeNodeName: "supervisor.example.test",
      dataDir,
      intent: { cluster: { members: [{ name: "supervisor.example.test" }] } },
    },
    identity: { name: "supervisor.example.test" },
    intentState: {},
    coldState,
    processController: { stop, start: jest.fn() },
    applyIntent: jest.fn(),
    environment: {},
    log: {},
  });
  expect(result).toBeDefined();
  const options = result.options;
  expect(options.getConfig()).toEqual(
    expect.objectContaining({ elera: true, runtimeNodeName: "supervisor.example.test", dataDir }),
  );
  await options.getStatus();
  options.getTraffic();
  options.getTelemetry();
  options.getTelemetryDetails("app");
  options.setDrain(true, false);
  options.getActiveIntent();
  options.getActiveIntent.apply({});
  options.leaseCredentials({});
  options.getColdBootstrap();
  options.getColdEvidence();
  options.getColdRecoveryProtocol();
  options.getColdBootstrapLocal();
  await expect(
    options.nodeDataReset.reset({
      node: "supervisor.example.test",
      dataDir,
      confirmation: "RESET supervisor.example.test",
      dryRun: true,
    }),
  ).resolves.toMatchObject({ status: "planned" });
  await expect(
    options.nodeDataReset.reset({
      node: "supervisor.example.test",
      dataDir,
      confirmation: "RESET supervisor.example.test",
      dryRun: true,
      force: true,
      fenced: true,
      routingExcluded: true,
      recoveryDisposition: "single-member-resync",
    }),
  ).resolves.toMatchObject({ status: "planned" });
  await expect(
    options.nodeDataReset.reset({
      node: "supervisor.example.test",
      dataDir,
      confirmation: "RESET supervisor.example.test",
      dryRun: false,
      idempotencyKey: "composition-reset",
    }),
  ).resolves.toMatchObject({ status: "completed" });
  expect(stop).toHaveBeenCalled();
  options.bootstrap();
  expect(coldState.bootstrapMaria).toHaveBeenCalled();
  await options.db.query("SELECT 1");
  await options.lifecycle.plan("bootstrap");
  await options.lifecycle.execute("bootstrap", { confirm: true });
  expect(query).toHaveBeenCalled();
  await rm(dataDir, { recursive: true, force: true });
});

test("composes safely when optional cold-recovery providers are absent", () => {
  const coldState = {
    drain: { isDraining: () => false, active: () => 0 },
    clusterDrain: { set: jest.fn() },
  };
  const result = createSupervisorControlComposition({
    db: { query: jest.fn() },
    metadata: {},
    managed: {},
    applications: {},
    reconciler: {},
    artifactStore: {},
    routingBundles: { lease: jest.fn() },
    routingEvent: jest.fn(),
    recovery: {},
    observationStore: { all: () => [] },
    health: { status: async () => ({}), cacheInfo: () => ({}) },
    clusterDrain: { set: jest.fn() },
    lifecycle: { get: () => "idle" },
    telemetry: { summary: () => ({}), details: () => ({}) },
    config: {
      runtimeNodeName: "node-a.example.test",
      dataDir: "data",
      intent: { cluster: { members: [{ name: "node-a.example.test" }] } },
    },
    identity: { name: "node-a.example.test" },
    intentState: {},
    coldState,
    processController: { stop: jest.fn(), start: jest.fn() },
    applyIntent: jest.fn(),
    environment: {},
    log: {},
  });
  expect(result.options.getColdBootstrap()).toBeUndefined();
  expect(result.options.getColdEvidence()).toBeUndefined();
  expect(result.options.getColdRecoveryProtocol()).toBeUndefined();
  expect(result.options.getColdBootstrapLocal()).toBeUndefined();
});
