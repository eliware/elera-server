import { expect, test } from "@jest/globals";
import { handleObservationRoute } from "../../../src/api/routes/observations.mjs";
const identity = { name: "n.example.test" };
const ctx = (method, path, body = {}) => {
  const out = {};
  return {
    method,
    path,
    environment: {},
    auth: { root: true },
    internal: true,
    getConfig: () => ({ intent: { cluster: { members: [{ name: identity.name }] } } }),
    identity,
    observations: [],
    request: {
      async *[Symbol.asyncIterator]() {
        yield JSON.stringify(body);
      },
    },
    response: { json: (status, value) => Object.assign(out, { status, value }) },
    out,
  };
};
test("accepts, lists, and evaluates observations", async () => {
  const c = ctx("POST", "/api/v1/cluster/observations", {
    nodeId: identity.name,
    address: identity.name,
    state: "Synced",
    synced: true,
    primary: "p",
    health: "ok",
  });
  expect(await handleObservationRoute(c)).toBe(true);
  expect(c.out.status).toBe(202);
  const list = ctx("GET", "/api/v1/cluster/observations");
  list.observations.push(c.out.value.data);
  expect(await handleObservationRoute(list)).toBe(true);
  const quorum = ctx("GET", "/api/v1/cluster/quorum");
  quorum.observations = [c.out.value.data];
  expect(await handleObservationRoute(quorum)).toBe(true);
});
test("ignores unrelated observation routes", async () => {
  expect(await handleObservationRoute(ctx("GET", "/other"))).toBe(false);
});
test("returns topology with observations and quorum", async () => {
  const c = ctx("GET", "/api/v1/cluster/topology");
  c.observationStore = { snapshot: () => [], upsert: () => ({ accepted: true }) };
  expect(await handleObservationRoute(c)).toBe(true);
  expect(c.out.value.data).toHaveProperty("quorum");
});
test("rejects stale observations from the store", async () => {
  const c = ctx("POST", "/api/v1/cluster/observations", {
    nodeId: identity.name,
    address: identity.name,
    state: "Synced",
    synced: true,
    primary: "p",
    health: "ok",
  });
  c.observationStore = { snapshot: () => [], upsert: () => ({ accepted: false, reason: "stale" }) };
  expect(await handleObservationRoute(c)).toBe(true);
  expect(c.out.status).toBe(409);
});
test("rejects an observation that conflicts with the authenticated peer identity", async () => {
  const c = ctx("POST", "/api/v1/cluster/observations", {
    nodeId: "other.example.test",
    address: "other.example.test",
    state: "Synced",
  });
  c.peerIdentity = identity;
  await expect(handleObservationRoute(c)).rejects.toMatchObject({ statusCode: 409 });
});
test("rejects missing identities and invalid observation addresses", async () => {
  await expect(
    handleObservationRoute({ ...ctx("GET", "/api/v1/cluster/observations"), identity: undefined }),
  ).rejects.toThrow("runtime identity is required");
  await expect(
    handleObservationRoute(ctx("POST", "/api/v1/cluster/observations")),
  ).rejects.toMatchObject({ statusCode: 400, message: "observation nodeId is required" });
  for (const body of [
    { nodeId: "invalid-host" },
    { nodeId: identity.name, address: "other.example.test" },
  ]) {
    await expect(
      handleObservationRoute(ctx("POST", "/api/v1/cluster/observations", body)),
    ).rejects.toMatchObject({ statusCode: 400 });
  }
});

test("requires read scopes and an authenticated configured peer for observations", async () => {
  const read = ctx("GET", "/api/v1/cluster/quorum");
  read.auth = { scopes: [] };
  await expect(handleObservationRoute(read)).rejects.toMatchObject({ statusCode: 403 });
  for (const path of ["/api/v1/cluster/observations", "/api/v1/cluster/topology"]) {
    const denied = ctx("GET", path);
    denied.auth = { scopes: [] };
    await expect(handleObservationRoute(denied)).rejects.toMatchObject({ statusCode: 403 });
  }
  const write = ctx("POST", "/api/v1/cluster/observations", {
    nodeId: "other.example.test",
    address: "other.example.test",
  });
  write.internal = false;
  await expect(handleObservationRoute(write)).rejects.toMatchObject({ statusCode: 403 });
  const noInternalFlag = ctx("POST", "/api/v1/cluster/observations", {
    nodeId: identity.name,
  });
  delete noInternalFlag.internal;
  await expect(handleObservationRoute(noInternalFlag)).rejects.toMatchObject({ statusCode: 403 });
  const missingConfig = ctx("POST", "/api/v1/cluster/observations", {
    nodeId: identity.name,
  });
  missingConfig.getConfig = undefined;
  await expect(handleObservationRoute(missingConfig)).rejects.toMatchObject({ statusCode: 403 });
  const unknownPeer = ctx("POST", "/api/v1/cluster/observations", {
    nodeId: "other.example.test",
    address: "other.example.test",
  });
  await expect(handleObservationRoute(unknownPeer)).rejects.toMatchObject({ statusCode: 403 });
});

test("allows read-scoped access to observation and topology views", async () => {
  for (const path of ["/api/v1/cluster/observations", "/api/v1/cluster/topology"]) {
    const view = ctx("GET", path);
    view.auth = { scopes: ["cluster:read"] };
    await expect(handleObservationRoute(view)).resolves.toBe(true);
    expect(view.out.status).toBe(200);
  }
});
