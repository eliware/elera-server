import { expect, jest, test } from "@jest/globals";
jest.useFakeTimers();
import { handleRoutingRoute } from "../../../../src/api/routes/routing.mjs";
import { handleRoutingInspection } from "../../../../src/api/routes/routing/inspection.mjs";

const request = (body = {}) => ({
  url: "http://localhost/api",
  async *[Symbol.asyncIterator]() {
    if (Object.keys(body).length) yield JSON.stringify(body);
  },
});
const node = {
  nodeId: "n.example.test",
  clusterId: "c",
  address: "n.example.test",
  sqlPort: 3306,
  synced: true,
  primary: "Primary",
  health: "ok",
  observedAt: Date.now(),
};
const context = (method, path, observations = [node], body = {}) => {
  const response = { json: jest.fn() };
  const observationStore = { snapshot: () => observations, upsert: jest.fn() };
  return {
    method,
    path,
    url: new URL(`http://localhost${path}`),
    identity: { name: "n.example.test" },
    request: request(body),
    response,
    observationStore,
    getStatus: jest.fn(async () => ({
      ready: true,
      values: {
        wsrep_local_state_comment: "Synced",
        wsrep_cluster_status: "Primary",
      },
    })),
    routingBundles: {
      lease: jest.fn(async () => ({
        routes: { primary: [{ host: "n.example.test", port: 3306 }] },
        bundleVersion: "v1",
        expiresAt: "2099-01-01",
      })),
    },
    routingEvent: jest.fn(() => undefined),
    environment: {
      ELERA_CLUSTER_SIZE: "1",
      ELERA_NODE_SQL_PORT: "3306",
      ELERA_PEERS: "",
    },
  };
};

test("delegates route inspection to the observation and decision policies", async () => {
  const response = { json: jest.fn() };
  const identity = { name: "a.example.test" };
  const observations = [
    {
      nodeId: identity.name,
      clusterId: "c",
      address: identity.name,
      sqlPort: 3306,
      synced: true,
      primary: "Primary",
      health: "ok",
      observedAt: Date.now(),
    },
  ];
  await expect(
    handleRoutingInspection({
      url: new URL("http://localhost/api/v1/routes?application=app"),
      response,
      identity,
      observationStore: { snapshot: () => observations, upsert: jest.fn() },
      getStatus: async () => ({ ready: true }),
      environment: {},
      getConfig: () => ({ httpPort: 8080 }),
    }),
  ).resolves.toBe(true);
  expect(response.json).toHaveBeenCalled();
});

test("uses seeded and cached routes and refreshes from peers", async () => {
  const seed = {
    primary: [{ host: "seed.example.test", port: 3306 }],
    balanced: [{ host: "seed.example.test", port: 3306 }],
  };
  const seeded = context("GET", "/api/v1/routes", []);
  seeded.routingEvent = () => ({ routes: seed });
  await handleRoutingRoute(seeded);
  expect(seeded.response.json).toHaveBeenCalledWith(200, expect.objectContaining({ data: seed }));
  const cached = context("GET", "/api/v1/routes", []);
  cached.routingEvent = () => undefined;
  await handleRoutingRoute(cached);
  expect(cached.response.json).toHaveBeenCalled();
  const peer = context("GET", "/api/v1/routes", []);
  peer.environment.ELERA_PEERS = "http://peer.example.test";
  peer.getStatus.mockRejectedValue(new Error("status unavailable"));
  peer.fetchImpl = undefined;
  peer.observationStore.snapshot = () => [node];
  await handleRoutingRoute(peer);
});

test("caches recent routes while observations recover", async () => {
  const identity = { name: "cache.example.test" };
  let observations = [{ ...node, nodeId: identity.name, address: identity.name }];
  const response = { json: jest.fn() };
  const inspect = () =>
    handleRoutingInspection({
      url: new URL("http://localhost/api/v1/routes?application=cache-coverage"),
      response,
      identity,
      observationStore: { snapshot: () => observations },
      environment: {},
    });

  await inspect();
  observations = [];
  await inspect();

  expect(response.json.mock.calls[1][1].data.balanced).toHaveLength(1);
});

test("handles missing identities, stores, and status providers", async () => {
  await expect(handleRoutingInspection()).rejects.toThrow("runtime identity is required");
  for (const observationStore of [undefined, {}, { snapshot: () => null }]) {
    const response = { json: jest.fn() };
    await expect(
      handleRoutingInspection({
        url: new URL("http://localhost/api/v1/routes"),
        response,
        identity: { name: "sparse.example.test" },
        observationStore,
        getStatus: async () => {
          throw new Error("status unavailable");
        },
        environment: undefined,
      }),
    ).resolves.toBe(true);
  }
  await expect(
    handleRoutingInspection({
      url: new URL("http://localhost/api/v1/routes"),
      response: { json: jest.fn() },
      identity: { name: "no-status.example.test" },
      observationStore: {},
      environment: {},
    }),
  ).resolves.toBe(true);
});

test("uses the default local SQL port when the environment is absent", async () => {
  const response = { json: jest.fn() };
  await handleRoutingInspection({
    url: new URL("http://localhost/api/v1/routes"),
    response,
    identity: { name: "fallback.example.test" },
    observationStore: { snapshot: () => [] },
    getStatus: async () => ({ ready: true }),
  });
  expect(response.json.mock.calls[0][1].data.primary[0].port).toBe(3306);
});

test("refreshes peer observations before local fallback", async () => {
  const identity = { name: "peer-a.example.test" };
  const observations = [];
  const response = { json: jest.fn() };
  await expect(
    handleRoutingInspection({
      url: new URL("http://localhost/api/v1/routes?application=peer-coverage"),
      response,
      identity,
      observationStore: {
        snapshot: () => observations,
        upsert: (item) => observations.push(item),
      },
      getActiveIntent: async () => ({
        cluster: {
          members: [
            { name: identity.name, address: identity.name },
            { name: "peer-b.example.test", address: "peer-b.example.test" },
          ],
        },
      }),
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          data: [
            {
              ...node,
              nodeId: "peer-b.example.test",
              address: "peer-b.example.test",
              clusterId: "c",
            },
          ],
        }),
      }),
      environment: {},
    }),
  ).resolves.toBe(true);
  expect(response.json.mock.calls[0][1].data.balanced).toHaveLength(1);
});
