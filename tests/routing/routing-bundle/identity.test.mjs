import { expect, test } from "@jest/globals";
import { createRoutingBundleService } from "../../../test-fixtures/routing/bundle-service-harness.mjs";
import { resolveRoutingBundleIdentity } from "../../../src/routing/routing-bundle/identity.mjs";

test("uses request identity when managed lease metadata is absent", () => {
  expect(
    resolveRoutingBundleIdentity(
      { application: "app", database: "db", identity: "writer" },
      {},
      { name: "node.example.test" },
    ),
  ).toEqual({
    application: "app",
    database: "db",
    credentialIdentity: "writer",
    key: "app",
  });
});

test("reuses a recent application route calculation and falls back to request application", async () => {
  let now = 100;
  const managed = {
    lease: async (request) => ({
      database: "db",
      identity: request.identity,
      username: "u",
      password: "p",
      routes: { primary: [{ host: "fallback.example.test", port: 3306 }], balanced: [] },
      expiresAt: "2099-01-01T00:00:00Z",
    }),
  };
  const observationStore = { snapshot: () => [] };
  const service = createRoutingBundleService({ managed, observationStore, now: () => now });
  await service.lease({ application: "app", identity: "id" });
  await service.lease({ application: "app", identity: "id" });
  now += 1001;
  await service.lease({ application: "app", identity: "id" });
});
test("uses the default application and bundle version when metadata omits them", async () => {
  const service = createRoutingBundleService({
    managed: {
      lease: async () => ({
        database: "db",
        identity: "id",
        username: "u",
        password: "p",
        expiresAt: "2099-01-01T00:00:00Z",
        routes: {
          primary: [{ host: "node.example.test", port: 3306 }],
          balanced: [{ host: "node.example.test", port: 3306 }],
        },
      }),
    },
    observationStore: { snapshot: () => [] },
  });
  const result = await service.lease({});
  expect(result.bundleVersion).toBe(1);
});
test("infers complete bundle identity context from an authenticated request", async () => {
  const service = createRoutingBundleService({
    managed: {
      lease: async () => ({
        username: "u",
        password: "p",
        routes: {
          primary: [{ host: "node.example.test", port: 3306 }],
          balanced: [{ host: "node.example.test", port: 3306 }],
        },
        expiresAt: "2099-01-01T00:00:00Z",
      }),
    },
    observationStore: { snapshot: () => [] },
  });
  const result = await service.lease({ application: "app", database: "db", identity: "id" });
  expect(result).toMatchObject({
    application: "app",
    database: "db",
    identity: "id",
    credentials: { username: "u" },
  });
});
test("rejects a managed lease that crosses the authenticated application boundary", async () => {
  const service = createRoutingBundleService({
    managed: {
      lease: async () => ({
        application: "other",
        database: "db",
        identity: "id",
        username: "u",
        password: "p",
        routes: { primary: [], balanced: [] },
        expiresAt: "2099-01-01T00:00:00Z",
      }),
    },
    observationStore: { snapshot: () => [] },
  });
  await expect(
    service.lease({ application: "app", database: "db", identity: "id" }),
  ).rejects.toMatchObject({ statusCode: 403 });
});
