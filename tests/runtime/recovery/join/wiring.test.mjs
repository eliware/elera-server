import { expect, jest, test } from "@jest/globals";
import "../../../../test-fixtures/suites/recovery-join-wiring.mjs";
import { createSupervisorRecoveryJoiner } from "../../../../src/runtime/recovery/join/wiring.mjs";

test("loads the createSupervisorRecoveryJoiner suite", () => {
  expect(typeof createSupervisorRecoveryJoiner).toBe("function");
});

const edgeIdentity = { name: "node-a.example.test" };
const edgeMembers = [
  { name: edgeIdentity.name, address: edgeIdentity.name },
  { name: "node-b.example.test", address: "node-b.example.test", url: "http://peer/" },
];
const createJoiner = (overrides = {}) =>
  createSupervisorRecoveryJoiner({
    identity: edgeIdentity,
    token: "coverage-token",
    timeoutMs: 100,
    recoveryState: { set: jest.fn() },
    fetchImpl: jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, data: { values: {} } }),
    })),
    ...overrides,
  });

test("validates constructor and request dependencies", async () => {
  expect(() => createSupervisorRecoveryJoiner()).toThrow("shared FQDN identity");
  expect(() => createJoiner({ identity: { name: "node-a" } })).toThrow("shared FQDN identity");
  expect(() => createJoiner({ timeoutMs: 0 })).toThrow("timeout and fetch");
  expect(() => createJoiner({ timeoutMs: 1.5 })).toThrow("timeout and fetch");
  expect(() => createJoiner({ fetchImpl: null })).toThrow("timeout and fetch");
  expect(() => createJoiner()()).toThrow("FQDN identities and addresses");
});

test("rejects invalid members and winner identities", () => {
  const joiner = createJoiner();
  expect(() => joiner({ members: [edgeMembers[0]] })).toThrow("FQDN identities and addresses");
  expect(() => joiner({ members: [edgeMembers[0], null] })).toThrow(
    "FQDN identities and addresses",
  );
  expect(() =>
    joiner({ members: [edgeMembers[0], { name: "peer.test", address: "bad" }] }),
  ).toThrow("FQDN identities and addresses");
  expect(() => joiner({ members: edgeMembers, bootstrap: { winner: "missing.test" } })).toThrow(
    "non-local winner",
  );
  expect(() => joiner({ members: edgeMembers, bootstrap: { winner: edgeIdentity.name } })).toThrow(
    "non-local winner",
  );
  expect(() =>
    joiner({
      members: [edgeMembers[1], { name: "node-c.example.test", address: "node-c.example.test" }],
      bootstrap: { winner: "node-b.example.test" },
    }),
  ).toThrow("not a configured recovery join member");
});

test("accepts a winner object and a peer URL", async () => {
  const fetchImpl = jest.fn(async (url) =>
    url.endsWith("/status")
      ? {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            data: {
              values: {
                wsrep_cluster_state_uuid: "c",
                wsrep_cluster_size: "2",
                wsrep_local_state_comment: "Synced",
                wsrep_ready: "ON",
                wsrep_cluster_status: "Primary",
              },
            },
          }),
        }
      : { ok: true, status: 202, json: async () => ({ ok: true, data: {} }) },
  );
  const joiner = createJoiner({ fetchImpl });
  await joiner({
    members: edgeMembers,
    bootstrap: { clusterId: "c", winner: { node: edgeMembers[1].name } },
  });
  expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
    "http://peer/api/v1/cluster/cold-recovery/join",
    "http://peer/api/v1/cluster/status",
  ]);
});
