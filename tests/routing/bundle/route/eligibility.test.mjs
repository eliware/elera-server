import { expect, jest, test } from "@jest/globals";
import { createRoutingBundleService } from "../../../../test-fixtures/routing/bundle-service-harness.mjs";
import { resolveEligibleBundleObservations } from "../../../../src/routing/bundle/route/eligibility.mjs";

jest.useFakeTimers();
test("returns no observations when the configured quorum fails", async () => {
  const result = await resolveEligibleBundleObservations([], {
    environment: { ELERA_CLUSTER_SIZE: "3" },
    now: 10_000,
    validateAddresses: false,
  });
  expect(result.quorum.quorum).toBe(false);
  expect(result.observations).toEqual([]);
});

test("rejects publication when address filtering removes the only eligible writer", async () => {
  const service = createRoutingBundleService({
    validateAddresses: true,
    resolveAddress: async (host) => {
      if (host === "bad.example.test") throw new Error("dns");
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
          nodeId: "bad.example.test",
          address: "bad.example.test",
          sqlPort: 3306,
          synced: true,
          primary: "Primary",
          health: "ok",
          observedAt: Date.now(),
        },
      ],
    },
  });
  await expect(service.lease({ identity: "id" })).rejects.toThrow();
});
test("uses the configured resolver for reachable addresses", async () => {
  const service = createRoutingBundleService({
    validateAddresses: true,
    resolveAddress: async () => ({ address: "127.0.0.1" }),
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
          nodeId: "local.example.test",
          address: "localhost.example.test",
          sqlPort: 3306,
          synced: true,
          primary: "Primary",
          health: "ok",
          observedAt: Date.now(),
        },
      ],
    },
  });
  expect((await service.lease({ identity: "id" })).routes.balanced[0].host).toBe(
    "localhost.example.test",
  );
});
test("rejects when address filtering is requested but quorum is unavailable", async () => {
  const service = createRoutingBundleService({
    validateAddresses: true,
    resolveAddress: jest.fn(),
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
          address: "n.example.test",
          synced: false,
          primary: "Non-Primary",
          health: "not-ready",
          observedAt: Date.now(),
        },
      ],
    },
  });
  await expect(service.lease({})).rejects.toThrow();
});
test("uses the observed count when cluster size is not configured", async () => {
  const service = createRoutingBundleService({
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
  expect((await service.lease({})).routes.balanced).toHaveLength(1);
});
test("rejects when quorum is unavailable without address validation", async () => {
  const service = createRoutingBundleService({
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
          synced: false,
          primary: "Non-Primary",
          health: "not-ready",
          observedAt: Date.now(),
        },
      ],
    },
  });
  await expect(service.lease({})).rejects.toThrow();
});
