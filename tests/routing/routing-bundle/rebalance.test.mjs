import { expect, jest, test } from "@jest/globals";
import { createRoutingBundleService } from "../../../test-fixtures/routing/bundle-service-harness.mjs";

import { createRoutingBundleRebalancer } from "../../../src/routing/routing-bundle/rebalance.mjs";

test("invalidates the selected application and returns its new bundle", async () => {
  const selection = { invalidate: jest.fn() };
  const bundle = { application: "app" };
  const lease = jest.fn(async () => bundle);
  const rebalance = createRoutingBundleRebalancer(lease, selection);
  await expect(rebalance({ application: "app" })).resolves.toEqual({
    bundle,
    recalculated: true,
  });
  expect(selection.invalidate).toHaveBeenCalledWith("app");
});

test("uses the default application when the request omits it", async () => {
  const selection = { invalidate: jest.fn() };
  const rebalance = createRoutingBundleRebalancer(async () => ({}), selection);
  await rebalance();
  expect(selection.invalidate).toHaveBeenCalledWith("default");
});

test("validates and explicitly recalculates a cached route", async () => {
  let now = 1000;
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
  const observationStore = {
    snapshot: () => [
      {
        nodeId: "n.example.test",
        address: "node.example.test",
        sqlPort: 3306,
        synced: true,
        primary: "Primary",
        health: "ok",
        observedAt: now,
      },
    ],
  };
  const service = createRoutingBundleService({ managed, observationStore, now: () => now });
  await service.lease({ identity: "id" });
  expect(await service.validate({ identity: "id" })).toMatchObject({
    valid: true,
    application: "app",
    routeCount: 1,
  });
  const result = await service.rebalance({ identity: "id", application: "app" });
  expect(result.recalculated).toBe(true);
  expect(result.bundle.application).toBe("app");
});
test("uses the one-second cache and supports default rebalance application", async () => {
  let now = 1000;
  let leases = 0;
  const service = createRoutingBundleService({
    now: () => now,
    managed: {
      lease: async () => {
        leases += 1;
        return {
          application: "app",
          database: "db",
          identity: "id",
          username: "u",
          password: "p",
          routes: { primary: [], balanced: [] },
          expiresAt: "2099-01-01T00:00:00Z",
        };
      },
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
          observedAt: now,
        },
      ],
    },
  });
  await service.lease({ identity: "id" });
  await service.lease({ identity: "id" });
  expect(leases).toBe(2);
  await service.rebalance({ identity: "id" });
  expect(leases).toBe(3);
});
