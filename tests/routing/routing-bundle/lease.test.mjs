import { expect, test } from "@jest/globals";
import { createRoutingBundleService } from "../../../test-fixtures/routing/bundle-service-harness.mjs";
import { createRoutingBundleLease } from "../../../src/routing/routing-bundle/lease.mjs";
test("creates a bundle from managed credentials and selected routes", async () => {
  const lease = createRoutingBundleLease({
    managed: {
      lease: async () => ({
        application: "app",
        database: "db",
        identity: "writer",
        username: "user",
        password: "secret",
        expiresAt: "2099-01-01T00:00:00Z",
      }),
    },
    identity: { name: "node.example.test" },
    environment: {},
    selection: {
      resolve: async () => ({
        primary: [{ host: "node.example.test", port: 3306 }],
        balanced: [{ host: "node.example.test", port: 3306 }],
        writer: { host: "node.example.test", port: 3306 },
        failover: [],
        readers: [{ host: "node.example.test", port: 3306 }],
        bundleVersion: 1,
      }),
    },
  });
  await expect(lease({})).resolves.toMatchObject({
    application: "app",
    database: "db",
    identity: "writer",
  });
});

test("rejects a bundle with no eligible writer", async () => {
  const service = createRoutingBundleService({
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
    observationStore: { snapshot: () => [] },
  });
  expect(await service.validate({ identity: "id" })).toMatchObject({ valid: false });
});
