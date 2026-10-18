import { jest, expect, test } from "@jest/globals";
import { createBundleRouteSelection } from "../../../../src/routing/bundle/route/selection.mjs";
import { createRoutingBundleService } from "../../../../test-fixtures/routing/bundle-service-harness.mjs";

jest.useFakeTimers();
const node = (name) => ({
  nodeId: name,
  address: name,
  clusterId: "cluster",
  state: "Synced",
  sqlPort: 3306,
  synced: true,
  primary: "Primary",
  health: "ok",
  observedAt: 10_000,
});

function selection(options = {}) {
  const assigned = new Map();
  return createBundleRouteSelection({
    observationStore: options.observationStore ?? { snapshot: () => [node("db.example.test")] },
    environment: { ELERA_CLUSTER_SIZE: "1" },
    now: options.now ?? (() => 10_000),
    assignmentStore: options.assignmentStore ?? {
      get: async (application) => assigned.get(application),
      set: async (application, writer) => assigned.set(application, writer),
    },
    validateAddresses: false,
    log: {},
  });
}

test("selects and caches eligible routes by application", async () => {
  const service = selection();
  const routes = await service.resolve("billing");
  expect(routes.primary[0]).toMatchObject({ host: "db.example.test", nodeId: "db.example.test" });
  expect(await service.resolve("billing")).toMatchObject(routes);
});

test("invalidates cached routes for an explicit rebalance", async () => {
  let observations = [node("db-a.example.test")];
  let current = 10_000;
  const routes = selection({
    observationStore: { snapshot: () => observations },
    now: () => current,
  });
  const first = await routes.resolve("billing");
  observations = [node("db-b.example.test")];
  current += 500;
  const cached = await routes.resolve("billing");
  expect(cached.primary[0].host).toBe(first.primary[0].host);
  routes.invalidate("billing");
  const refreshed = await routes.resolve("billing");
  expect(refreshed.primary[0].host).toBe("db-b.example.test");
});

test("rejects when the configured quorum is incomplete", async () => {
  const service = createRoutingBundleService({
    environment: { ELERA_CLUSTER_SIZE: "3" },
    managed: {
      lease: async () => ({
        application: "app",
        database: "db",
        identity: "id",
        username: "u",
        password: "p",
        expiresAt: "2099-01-01T00:00:00Z",
        routes: { primary: [], balanced: [] },
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
  await expect(service.lease({})).rejects.toThrow();
});
