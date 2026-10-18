import { expect, jest, test } from "@jest/globals";
import { join } from "node:path";
import { installMemoryFileSystem } from "../../../test-fixtures/memory-filesystem.mjs";

const __memoryFs = installMemoryFileSystem(jest);
jest.unstable_mockModule("node:fs/promises", () => __memoryFs);
jest.unstable_mockModule("node:fs", () => __memoryFs);
jest.unstable_mockModule("node:os", () => ({ tmpdir: () => "/tmp" }));
const { mkdtemp, rm } = __memoryFs;
const tmpdir = () => "/tmp";

const createNodeDataReset = jest.fn((options) => ({
  options,
  async reset() {
    await options.fence();
    await options.isFenced();
    await options.excludeRouting();
    await options.isRoutingExcluded();
    await options.getDonors();
    options.stop();
    options.restart();
    options.audit.reset({});
    return { donor: "donor", next: "re-included" };
  },
}));
jest.unstable_mockModule("../../../src/lifecycle/node/data-reset.mjs", () => ({
  createNodeDataReset,
}));
const { createControlResetWiring } = await import("../../../src/runtime/control/reset-wiring.mjs");
const createControlApiForComposition = jest.fn((options) => ({ options }));
jest.unstable_mockModule("../../../src/control-api.mjs", () => ({
  createControlApi: createControlApiForComposition,
}));
const { createSupervisorControlComposition } =
  await import("../../../src/runtime/control/composition.mjs");

test("wires reset fencing, donor evidence, and process control", async () => {
  let draining = false;
  const setDrain = jest.fn((value) => {
    draining = value;
  });
  const processController = { stop: jest.fn(), start: jest.fn() };
  const result = createControlResetWiring({
    identity: { name: "node.example.test" },
    config: { dataDir: "/data", shutdownTimeoutMs: 50 },
    health: { status: jest.fn() },
    recovery: { status: jest.fn() },
    observationStore: {
      all: () => [
        { nodeId: "ready", health: "ready", primary: "Primary" },
        { node: "ok", health: "ok", primary: true, healthy: false },
      ],
    },
    processController,
    coldState: { clusterDrain: { set: setDrain }, drain: { isDraining: () => draining } },
    log: {},
  });
  const options = result.nodeDataReset.options;
  await options.getStatus();
  await options.getRecoveryState();
  await options.fence();
  expect(await options.isFenced()).toBe(true);
  await options.excludeRouting();
  expect(await options.isRoutingExcluded()).toBe(true);
  expect(await options.getDonors()).toEqual([
    { nodeId: "ready", health: "ready", primary: true, node: "ready", healthy: true },
    { node: "ok", health: "ok", primary: true, healthy: false },
  ]);
  options.stop();
  options.restart();
  expect(processController.stop).toHaveBeenCalledWith(50);
  expect(processController.start).toHaveBeenCalled();
});

test("executes resync only after supervisor fencing and exclusion are verified", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "supervisor-resync-"));
  const order = [];
  let draining = false;
  const processController = {
    stop: jest.fn(() => order.push("stop")),
    start: jest.fn(() => order.push("restart")),
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
    recovery: { status: jest.fn(() => ({})) },
    observationStore: { all: () => [{ nodeId: "donor", health: "ok", primary: "Primary" }] },
    identity: { name: "target.example.test" },
    health: {
      status: jest.fn(async () => ({
        ready: true,
        values: {
          wsrep_local_state_comment: "Synced",
          wsrep_ready: "ON",
          wsrep_cluster_status: "Primary",
        },
      })),
      cacheInfo: () => ({}),
    },
    clusterDrain: { set: jest.fn() },
    lifecycle: { get: () => "running" },
    telemetry: { summary: () => ({}), details: () => ({}) },
    config: {
      elera: true,
      runtimeNodeName: "target",
      dataDir,
      shutdownTimeoutMs: 100,
      resyncPollMs: 1,
      resyncTimeoutMs: 100,
      intent: { cluster: { members: [{ name: "target.example.test" }] } },
    },
    intentState: {},
    coldState: {
      drain: { isDraining: () => draining, active: () => 0 },
      clusterDrain: {
        set: (value) => {
          draining = value;
          order.push(value ? "fence" : "undrain");
        },
      },
    },
    processController,
    applyIntent: jest.fn(),
    environment: {},
    log: { reset: (event) => order.push(`reset:${event}`) },
  });
  try {
    const removeIndex = order.length;
    await expect(
      result.options.nodeDataReset.reset({
        node: "target",
        dataDir,
        force: true,
        recoveryDisposition: "single-member-resync",
        confirmation: "RESET target",
        idempotencyKey: "composition-resync",
      }),
    ).resolves.toMatchObject({ donor: "donor", next: "re-included" });
    expect(order.slice(removeIndex)).toEqual([
      "fence",
      "fence",
      "stop",
      "restart",
      "reset:[object Object]",
    ]);
    expect(processController.stop).toHaveBeenCalled();
    expect(processController.start).toHaveBeenCalled();
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});
