import { jest, expect, test } from "@jest/globals";
import { createRoutingEventSnapshot } from "../../../src/routing/event/snapshot.mjs";
import { validateRoutingEvent } from "@eliware/elera-lib";

jest.useFakeTimers();
const validNode = (overrides = {}) => ({
  nodeId: "node.example.test",
  clusterId: "cluster-a",
  state: "Synced",
  address: "db.example.test",
  sqlPort: 3306,
  synced: true,
  primary: "Primary",
  health: "ok",
  observedAt: Date.now(),
  ...overrides,
});

test("validates the observation store, runtime identity, and observed node names", () => {
  expect(() => createRoutingEventSnapshot()).toThrow("observation store");
  expect(() =>
    createRoutingEventSnapshot({
      observationStore: { snapshot: () => [] },
      nodeIdentity: { name: "bad" },
    }),
  ).toThrow("valid hostname");
  const create = (item) =>
    createRoutingEventSnapshot({
      nodeIdentity: { name: "node.example.test" },
      observationStore: { snapshot: () => [item] },
    });
  expect(() => create({ ...validNode(), nodeId: "bad" })()).toThrow("FQDN");
  expect(() => create({ ...validNode(), address: "bad" })()).toThrow("FQDN");
});

test("persists an elected writer and reuses healthy routes for five seconds", () => {
  let now = Date.now();
  let observations = [validNode()];
  const set = jest.fn();
  const snapshot = createRoutingEventSnapshot({
    nodeIdentity: { name: "node.example.test" },
    observationStore: { snapshot: () => observations },
    assignmentStore: { peek: () => undefined, set },
    environment: { ELERA_CLUSTER_SIZE: "1" },
    now: () => now,
  });
  const healthy = snapshot("app");
  expect(healthy.context.clusterCondition).toBe("Primary");
  expect(set).toHaveBeenCalledWith("app", "db.example.test", expect.any(String));
  observations = [validNode({ synced: false, health: "not-ready" })];
  now += 1000;
  expect(snapshot("app").topology.nodes[0].state).toBe("unready");
  now += 5000;
  expect(snapshot("app").context.clusterCondition).toBe("Non-Primary");
});

test("uses node port defaults and retains remote observations without local drain state", () => {
  const peer = validNode({
    nodeId: "peer.example.test",
    address: "peer-db.example.test",
    sqlPort: null,
  });
  const snapshot = createRoutingEventSnapshot({
    nodeIdentity: { name: "node.example.test" },
    observationStore: { snapshot: () => [validNode({ sqlPort: null }), peer] },
    environment: { ELERA_NODE_SQL_PORT: "4406", ELERA_CLUSTER_SIZE: "1" },
  });
  expect(
    snapshot().topology.nodes.map(({ nodeId, sqlPort, draining }) => [nodeId, sqlPort, draining]),
  ).toEqual([
    ["node.example.test", 4406, false],
    ["peer.example.test", 4406, false],
  ]);
  const defaultPort = createRoutingEventSnapshot({
    nodeIdentity: { name: "node.example.test" },
    observationStore: { snapshot: () => [validNode({ sqlPort: null })] },
    environment: { ELERA_CLUSTER_SIZE: "1" },
  });
  expect(defaultPort().topology.nodes[0].sqlPort).toBe(3306);
});

test("creates stable versioned routing events and advances on changes", () => {
  const node = {
    nodeId: "node.example.test",
    address: "db.example.test",
    sqlPort: 3306,
    synced: true,
    primary: "Primary",
    health: "ok",
    observedAt: Date.now(),
  };
  let drained = false;
  const observations = [node];
  const snapshot = createRoutingEventSnapshot({
    nodeIdentity: { name: "node.example.test" },
    observationStore: { snapshot: () => observations },
    environment: { ELERA_CLUSTER_SIZE: "1" },
    getDrained: () => drained,
  });
  const first = snapshot("app");
  expect(first.type).toBe("routing.topology");
  expect(first.topology.nodes[0].address).toBe("db.example.test");
  expect(validateRoutingEvent(first)).toEqual(first);
  expect(snapshot("app")).toBe(first);
  drained = true;
  expect(snapshot("app").version).toBe(2);
});
test("marks topology unavailable during quorum loss and expires the last healthy routes", () => {
  let now = 1000;
  let observations = [
    {
      nodeId: "node.example.test",
      clusterId: "c",
      address: "db.example.test",
      sqlPort: 3306,
      synced: true,
      primary: "Primary",
      health: "ok",
      observedAt: now,
    },
  ];
  const snapshot = createRoutingEventSnapshot({
    nodeIdentity: { name: "node.example.test" },
    observationStore: { snapshot: () => observations },
    environment: { ELERA_CLUSTER_SIZE: "1" },
    now: () => now,
  });
  const first = snapshot("app");
  expect(first.topology.nodes[0].state).toBe("ready");
  observations = [{ ...observations[0], synced: false, health: "not-ready" }];
  now += 1000;
  expect(snapshot("app").topology.nodes[0].state).toBe("unready");
  now += 5000;
  expect(snapshot("app").topology.nodes[0].state).toBe("unready");
});
test("handles missing observations and applications without prior healthy routes", () => {
  const snapshot = createRoutingEventSnapshot({
    nodeIdentity: { name: "node.example.test" },
    observationStore: { snapshot: () => [] },
  });
  expect(snapshot()).toBeTruthy();
});
test("marks the local node immediately while draining", () => {
  const observationStore = {
    snapshot: () => [
      {
        nodeId: "elera.example.test",
        synced: true,
        primary: "Primary",
        health: "ok",
        address: "db.example.test",
        sqlPort: 3306,
        observedAt: Date.now(),
      },
    ],
  };
  const snapshot = createRoutingEventSnapshot({
    nodeIdentity: { name: "elera.example.test" },
    observationStore,
    environment: { ELERA_NODE_NAME: "elera.example.test", ELERA_CLUSTER_SIZE: "1" },
    getDrained: () => true,
  });
  expect(snapshot("app").topology.nodes[0].draining).toBe(true);
});
test("uses the resolved runtime identity when applying local drain state", () => {
  const now = Date.now();
  const snapshot = createRoutingEventSnapshot({
    nodeIdentity: { name: "resolved.example" },
    observationStore: {
      snapshot: () => [
        {
          nodeId: "resolved.example",
          synced: true,
          primary: "Primary",
          health: "ok",
          address: "db.example.test",
          sqlPort: 3306,
          observedAt: now,
        },
      ],
    },
    environment: { ELERA_CLUSTER_SIZE: "1" },
    getDrained: () => true,
    now: () => now,
  });
  expect(snapshot("app").topology.nodes[0].draining).toBe(true);
});
test("defaults the local drain state to serving", () => {
  const snapshot = createRoutingEventSnapshot({
    nodeIdentity: { name: "elera.example.test" },
    observationStore: {
      snapshot: () => [
        {
          nodeId: "elera.example.test",
          synced: true,
          primary: "Primary",
          health: "ok",
          address: "db.example.test",
          sqlPort: 3306,
          observedAt: Date.now(),
        },
      ],
    },
    environment: { ELERA_CLUSTER_SIZE: "1" },
  });
  expect(snapshot("app").topology.nodes[0].draining).toBe(false);
});
test("does not surface assignment persistence failures", async () => {
  const snapshot = createRoutingEventSnapshot({
    nodeIdentity: { name: "node.example.test" },
    observationStore: {
      snapshot: () => [
        {
          nodeId: "node.example.test",
          clusterId: "cluster-a",
          state: "Synced",
          synced: true,
          primary: "Primary",
          health: "ok",
          address: "db.example.test",
          sqlPort: 3306,
          observedAt: Date.now(),
        },
      ],
    },
    assignmentStore: {
      peek: () => undefined,
      set: async () => {
        throw new Error("storage unavailable");
      },
    },
    environment: { ELERA_CLUSTER_SIZE: "1" },
  });
  expect(snapshot("app")).toBeTruthy();
  await Promise.resolve();
});
