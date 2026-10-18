import { jest, expect, test } from "@jest/globals";
import { createRoutingEventSnapshot } from "../../../src/routing/event/snapshot.mjs";
import { validateRoutingEvent } from "@eliware/elera-lib";

jest.useFakeTimers();
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
