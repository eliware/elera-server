import { expect, test } from "@jest/globals";
import { createSupervisorCluster } from "../../src/runtime/cluster-wiring.mjs";

const dependencies = {
  query: async () => [[], []],
  health: { status: async () => ({}) },
  processController: {},
  clusterDrain: { set: () => {} },
  identity: { name: "node.example.test" },
  config: { intent: { cluster: { members: [{ name: "node.example.test" }] } } },
  createLifecycleManagerImpl: () => ({}),
};

test("validates cluster wiring dependencies and configured identity", () => {
  expect(() => createSupervisorCluster()).toThrow("dependencies are required");
  expect(() => createSupervisorCluster({ ...dependencies, query: null })).toThrow(
    "dependencies are required",
  );
  expect(() => createSupervisorCluster({ ...dependencies, identity: { name: "invalid" } })).toThrow(
    "valid hostname",
  );
  expect(() => createSupervisorCluster({ ...dependencies, identity: undefined })).toThrow(
    "valid hostname",
  );
  expect(() => createSupervisorCluster({ ...dependencies, config: {} })).toThrow(
    "not a configured member",
  );
  expect(() =>
    createSupervisorCluster({ ...dependencies, config: { intent: { cluster: { members: [] } } } }),
  ).toThrow("not a configured member");
  expect(() =>
    createSupervisorCluster({
      ...dependencies,
      config: { intent: { cluster: { members: [{ name: "peer.example.test" }] } } },
    }),
  ).toThrow("not a configured member");
});

test("wires cluster lifecycle status and operations", async () => {
  let started = false;
  let drained = false;
  let lifecycleOptions;
  const identity = { name: "node.example.test", address: "node.example.test" };
  const config = {
    intent: {
      cluster: { members: [identity, { name: "peer.example.test", address: "peer.example.test" }] },
    },
  };
  const lifecycle = createSupervisorCluster({
    query: async () => [[], []],
    health: { status: async () => ({ ready: true }) },
    processController: {
      start: async () => {
        started = true;
      },
    },
    clusterDrain: {
      set: (value) => {
        drained = value;
      },
    },
    environment: {},
    config,
    identity,
    createLifecycleManagerImpl: (options) => {
      lifecycleOptions = options;
      return { marker: true };
    },
  });
  expect(lifecycle).toEqual({ marker: true });
  await expect(lifecycleOptions.status()).resolves.toEqual({ ready: true });
  await lifecycleOptions.operations.recover();
  await lifecycleOptions.operations.leave();
  expect(started).toBe(true);
  expect(drained).toBe(true);
});
