import { jest, expect, test } from "@jest/globals";
import { createRoutingBundleService } from "../../../test-fixtures/routing/bundle-service-harness.mjs";
import { createRoutingBundleService as createProductionRoutingBundleService } from "../../../src/routing/bundle/service.mjs";

jest.useFakeTimers();
test("builds the persistent assignment store from configured paths", () => {
  const dependencies = {
    managed: { lease: async () => ({}) },
    observationStore: { snapshot: () => [] },
    identity: { name: "node.example.test" },
  };
  expect(
    createProductionRoutingBundleService({
      ...dependencies,
      environment: { ELERA_ASSIGNMENTS_PATH: "assignments.json" },
    }),
  ).toBeDefined();
  expect(
    createProductionRoutingBundleService({
      ...dependencies,
      environment: { MARIADB_DATA_DIR: "mysql" },
    }),
  ).toBeDefined();
  expect(createProductionRoutingBundleService({ ...dependencies, environment: {} })).toBeDefined();
});
test("combines managed credentials with current eligible routes", async () => {
  const service = createRoutingBundleService({
    managed: {
      lease: async () => ({
        application: "app",
        database: "db",
        identity: "id",
        username: "u",
        password: "p",
        routes: {
          primary: [{ host: "fallback.example.test", port: 3306 }],
          balanced: [{ host: "fallback.example.test", port: 3306 }],
        },
        expiresAt: "2099-01-01T00:00:00Z",
      }),
    },
    observationStore: {
      snapshot: () => [
        {
          nodeId: "n.example.test",
          address: "node.example.test",
          sqlPort: 3306,
          synced: true,
          primary: "Primary",
          health: "ok",
          observedAt: Date.now(),
        },
      ],
    },
  });
  const result = await service.lease({ identity: "id" });
  expect(result.routes.primary[0].host).toBe("node.example.test");
  expect(result.writer).toEqual({
    host: "node.example.test",
    port: 3306,
    nodeId: "n.example.test",
  });
  expect(result.failover).toEqual([]);
  expect(result.readers).toEqual([
    { host: "node.example.test", port: 3306, nodeId: "n.example.test" },
  ]);
  expect(result.credentials.username).toBe("u");
});
test("records the selected writer assignment", async () => {
  let assigned;
  const service = createRoutingBundleService({
    assignmentStore: {
      get: async () => undefined,
      set: async (application, node) => {
        assigned = [application, node];
      },
    },
    managed: {
      lease: async () => ({
        application: "app",
        database: "db",
        identity: "id",
        username: "u",
        password: "p",
        routes: { primary: [], balanced: [] },
        expiresAt: "2099-01-01T00:00:00Z",
      }),
    },
    observationStore: {
      snapshot: () => [
        {
          nodeId: "n.example.test",
          address: "node.example.test",
          sqlPort: 3306,
          synced: true,
          primary: "Primary",
          health: "ok",
          observedAt: Date.now(),
        },
      ],
    },
  });
  await service.lease({ identity: "id" });
  expect(assigned).toEqual(["app", "node.example.test"]);
});
test("REST bundle preserves credentials while topology snapshot remains credential-free", async () => {
  const assignments = new Map();
  const assignmentStore = {
    get: async (app) => assignments.get(app),
    set: async (app, node) => assignments.set(app, node),
    peek: (app) => assignments.get(app),
  };
  const observationStore = {
    snapshot: () => [
      {
        nodeId: "n.example.test",
        address: "node.example.test",
        sqlPort: 3306,
        synced: true,
        primary: "Primary",
        health: "ok",
        observedAt: Date.now(),
      },
    ],
  };
  const managed = {
    lease: async () => ({
      application: "app",
      database: "db",
      identity: "id",
      username: "u",
      password: "p",
      routes: { primary: [], balanced: [] },
      expiresAt: "2099-01-01T00:00:00Z",
    }),
  };
  const service = createRoutingBundleService({ managed, observationStore, assignmentStore });
  const { createRoutingEventSnapshot } = await import("../../../src/routing/event/snapshot.mjs");
  const event = createRoutingEventSnapshot({
    observationStore,
    assignmentStore,
    nodeIdentity: { name: "node.example.test" },
    environment: { ELERA_CLUSTER_SIZE: "1" },
  });
  const bundle = await service.lease({ identity: "id" });
  const topology = event("app");
  expect(bundle.credentials.username).toBe("u");
  expect(topology.type).toBe("routing.topology");
  expect(topology.credentials).toBeUndefined();
  expect(topology.topology.nodes[0]).toMatchObject({
    nodeId: "n.example.test",
    address: "node.example.test",
    sqlPort: 3306,
  });
});
test("requires both dependencies and returns no routes when no node is eligible", async () => {
  expect(() => createRoutingBundleService()).toThrow();
  const service = createRoutingBundleService({
    managed: {
      lease: async () => ({
        application: "app",
        database: "db",
        identity: "id",
        username: "u",
        password: "p",
        routes: {
          primary: [{ host: "fallback.example.test", port: 3306 }],
          balanced: [{ host: "fallback.example.test", port: 3306 }],
        },
        expiresAt: "2099-01-01T00:00:00Z",
      }),
    },
    observationStore: { snapshot: () => [] },
  });
  expect((await service.lease({ identity: "id" })).routes.primary[0]).toMatchObject({
    host: "fallback.example.test",
    nodeId: "fallback.example.test",
  });
});
test("reports invalid bundles instead of throwing validation errors", async () => {
  const service = createRoutingBundleService({
    managed: { lease: async () => ({ identity: "id", routes: {} }) },
    observationStore: { snapshot: () => [] },
  });
  expect(await service.validate({ identity: "id" })).toMatchObject({
    valid: false,
    error: expect.stringContaining("required"),
  });
});
