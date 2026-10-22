import { expect, jest, test } from "@jest/globals";
import {
  refreshLocalObservation,
  refreshPeerObservations,
} from "../../src/routing/local-observation.mjs";

const identity = { name: "node-a.example.test" };
const members = [
  { name: "node-a.example.test", address: "node-a.example.test" },
  { name: "node-b.example.test", address: "node-b.example.test" },
];

test("refreshes local health into an observation", async () => {
  const observationStore = { upsert: jest.fn() };
  await refreshLocalObservation({
    observationStore,
    getStatus: async () => ({
      ready: true,
      values: { wsrep_local_state_comment: "Synced", wsrep_cluster_status: "Primary" },
    }),
    identity,
    now: () => 10,
  });
  expect(observationStore.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      nodeId: identity.name,
      address: identity.name,
      synced: true,
      primary: "Primary",
      observedAt: 10,
    }),
  );
});

test("skips status failures and refreshes peer observations best effort", async () => {
  const observationStore = { upsert: jest.fn() };
  await refreshLocalObservation({
    observationStore,
    getStatus: async () => {
      throw new Error("down");
    },
    identity,
  });
  const fetchImpl = jest.fn(async () => ({
    ok: true,
    json: async () => ({ data: [{ nodeId: members[1].name, address: members[1].address }] }),
  }));
  await refreshPeerObservations({ observationStore, identity, members, token: "t", fetchImpl });
  expect(observationStore.upsert).toHaveBeenCalledWith({
    nodeId: members[1].name,
    address: members[1].address,
  });
});

test("ignores peer responses without an observation array", async () => {
  const observationStore = { upsert: jest.fn() };
  await refreshPeerObservations({
    identity,
    members,
    observationStore,
    fetchImpl: async () => ({ ok: true, json: async () => ({}) }),
  });
  expect(observationStore.upsert).not.toHaveBeenCalled();
});

test("uses defaults for sparse local status and peer transport failures", async () => {
  const observationStore = { upsert: jest.fn() };
  await refreshLocalObservation({
    observationStore,
    getStatus: async () => ({ ready: false }),
    identity,
    now: () => 1,
  });
  expect(observationStore.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      nodeId: identity.name,
      synced: false,
      primary: "Unknown",
      health: "not-ready",
    }),
  );
  await refreshPeerObservations({
    identity,
    members,
    observationStore,
    fetchImpl: async () => {
      throw new Error("network");
    },
  });
});

test("uses ready state when status omits the wsrep state", async () => {
  const observationStore = { upsert: jest.fn() };
  await refreshLocalObservation({
    observationStore,
    getStatus: async () => ({ ready: true }),
    identity,
    now: () => 1,
  });
  expect(observationStore.upsert).toHaveBeenCalledWith(expect.objectContaining({ state: "Ready" }));
});

test("skips peer work when only the local member is configured", async () => {
  const fetchImpl = jest.fn();
  await refreshPeerObservations({
    identity,
    members: [members[0]],
    observationStore: { upsert: jest.fn() },
    fetchImpl,
  });
  expect(fetchImpl).not.toHaveBeenCalled();
});

test("ignores null peer data and unsuccessful responses", async () => {
  const observationStore = { upsert: jest.fn() };
  const fetchImpl = jest.fn(async () => ({ ok: false, status: 503 }));
  await refreshPeerObservations({ identity, members, observationStore, fetchImpl, token: "t" });
  expect(observationStore.upsert).not.toHaveBeenCalled();
});

test("uses the root token when no token override is supplied", async () => {
  const fetchImpl = jest.fn(async () => ({ ok: true, json: async () => ({ data: [] }) }));
  await refreshPeerObservations({
    identity,
    members,
    environment: { ROOT_TOKEN: "root-token" },
    fetchImpl,
    observationStore: { upsert: jest.fn() },
  });
  expect(fetchImpl.mock.calls[0][1].headers.authorization).toBe("Bearer root-token");
});

test("rejects missing dependencies and invalid runtime identities", async () => {
  await expect(refreshLocalObservation()).rejects.toThrow("observation store and status reader");
  await expect(
    refreshLocalObservation({ observationStore: { upsert: jest.fn() }, getStatus: jest.fn() }),
  ).rejects.toThrow("valid hostname");
  await expect(refreshPeerObservations()).rejects.toThrow("observation store and fetch");
  await expect(
    refreshPeerObservations({
      observationStore: { upsert: jest.fn() },
      fetchImpl: jest.fn(),
      identity: { name: "invalid" },
    }),
  ).rejects.toThrow("valid hostname");
});

test("validates configured peers and requires exactly one local member", async () => {
  const options = { identity, observationStore: { upsert: jest.fn() }, fetchImpl: jest.fn() };
  await expect(refreshPeerObservations({ ...options, members: null })).rejects.toThrow("FQDN");
  await expect(refreshPeerObservations({ ...options, members: [] })).rejects.toThrow("FQDN");
  await expect(refreshPeerObservations({ ...options, members: [{}] })).rejects.toThrow("FQDN");
  await expect(
    refreshPeerObservations({ ...options, members: [{ name: identity.name, address: "bad" }] }),
  ).rejects.toThrow("FQDN");
  await expect(
    refreshPeerObservations({
      ...options,
      members: [{ name: members[1].name, address: members[1].address }],
    }),
  ).rejects.toThrow("exactly one");
});

test("skips observations that do not match the configured peer", async () => {
  const observationStore = { upsert: jest.fn() };
  await refreshPeerObservations({
    identity,
    members,
    observationStore,
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ data: [{ nodeId: "other.example.test", address: members[1].address }] }),
    }),
  });
  expect(observationStore.upsert).not.toHaveBeenCalled();
});
