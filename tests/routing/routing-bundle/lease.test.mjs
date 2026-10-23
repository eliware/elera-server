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

test("creates token bundles with the token account and app routing assignment", async () => {
  const resolved = [];
  const lease = createRoutingBundleLease({
    managed: {
      lease: async () => ({}),
      sqlConnection: async ({ root, tokenId }) => ({
        username: root ? "elera_root" : `elera_t_${tokenId}`,
        password: root ? "root-db-secret" : "token-db-secret",
      }),
    },
    identity: { name: "node.example.test" },
    environment: {},
    selection: {
      resolve: async (application) => {
        resolved.push(application);
        return {
          primary: [{ host: "node.example.test", port: 3306 }],
          balanced: [{ host: "node.example.test", port: 3306 }],
          writer: { host: "node.example.test", port: 3306 },
          failover: [],
          readers: [],
          bundleVersion: 2,
        };
      },
    },
  });
  await expect(lease({ root: true })).resolves.toMatchObject({
    application: "default",
    database: "elera_meta",
    physicalDatabase: "elera_meta",
    identity: "root",
    credentials: { username: "elera_root", password: "root-db-secret" },
  });
  await expect(
    lease({ tokenId: "42", name: "admin", application: "payments" }),
  ).resolves.toMatchObject({
    application: "payments",
    identity: "admin",
    credentials: { username: "elera_t_42", password: "token-db-secret" },
  });
  await expect(lease({ tokenId: "43" })).resolves.toMatchObject({ identity: "token" });
  expect(resolved).toEqual(["default", "payments", "default"]);
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

test("keeps the managed route set when no balanced token route is available", async () => {
  const lease = createRoutingBundleLease({
    managed: {
      lease: async () => ({
        application: "payments",
        database: "billing",
        identity: "runtime",
        username: "user",
        password: "secret",
        expiresAt: "2099-01-01T00:00:00Z",
        routes: {
          primary: [{ host: "node.example.test", port: 3306 }],
          balanced: [{ host: "node.example.test", port: 3306 }],
        },
      }),
    },
    identity: { name: "node.example.test" },
    environment: {},
    selection: {
      resolve: async () => ({ primary: [], balanced: [], bundleVersion: "unused" }),
    },
  });
  await expect(lease({})).resolves.toMatchObject({
    application: "payments",
    database: "billing",
    credentials: { username: "user" },
  });
});
