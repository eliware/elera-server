import { expect as __fixture3_expect, test as __fixture3_test } from "@jest/globals";
import { createColdRecoveryProtocol as __fixture3_createColdRecoveryProtocol } from "../../src/cluster/cold-bootstrap/protocol.mjs";
import { createRecoveryLease as __fixture3_createRecoveryLease } from "../../src/cluster/cold-bootstrap/lease.mjs";
import { mkdtemp as __fixture3_mkdtemp, rm as __fixture3_rm } from "node:fs/promises";
import { join as __fixture3_join } from "node:path";
import { tmpdir as __fixture3_tmpdir } from "node:os";
import { expect, jest, test } from "@jest/globals";
import { createSupervisorRecoveryJoiner } from "../../src/runtime/recovery/join/wiring.mjs";

test("creates a sequential winner-side recovery joiner", async () => {
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
      : { ok: true, status: 202, json: async () => ({ ok: true, data: { status: "ready" } }) },
  );
  const publishRecovery = jest.fn(async () => true);
  const joiner = createSupervisorRecoveryJoiner({
    identity: { name: "node-a.example.test" },
    token: "secret",
    timeoutMs: 10,
    httpPort: 8080,
    recoveryState: { set: jest.fn() },
    recoveryAudit: { joinComplete: jest.fn() },
    publishRecovery,
    log: {},
    fetchImpl,
  });
  expect(typeof joiner).toBe("function");
  await expect(
    joiner({
      bootstrap: { epoch: 1, clusterId: "c", winner: "node-b.example.test" },
      members: [
        { name: "node-a.example.test", address: "node-a.example.test" },
        { name: "node-b.example.test", address: "node-b.example.test" },
      ],
    }),
  ).resolves.toEqual({ completed: ["node-b.example.test"] });
  expect(fetchImpl).toHaveBeenCalledWith(
    expect.stringContaining("node-b.example.test"),
    expect.objectContaining({ method: "POST" }),
  );
  expect(publishRecovery).toHaveBeenCalledWith({ epoch: 1, members: ["node-b.example.test"] });
});

test("uses a no-op completion publisher when none is supplied", async () => {
  const joiner = createSupervisorRecoveryJoiner({
    identity: { name: "node-c.example.test" },
    token: "secret",
    timeoutMs: 10,
    recoveryState: { set: jest.fn() },
    recoveryAudit: {},
    log: {},
    fetchImpl: jest.fn(async (url) =>
      url.endsWith("/status")
        ? {
            ok: true,
            status: 200,
            json: async () => ({
              ok: true,
              data: {
                wsrep_cluster_state_uuid: "c",
                wsrep_cluster_size: "3",
                wsrep_local_state_comment: "Synced",
                wsrep_ready: "ON",
                wsrep_cluster_status: "Primary",
              },
            }),
          }
        : { ok: true, status: 202, json: async () => ({ ok: true, data: { status: "ready" } }) },
    ),
  });
  await expect(
    joiner({
      members: [
        { name: "node-a.example.test", address: "node-a.example.test" },
        { name: "node-b.example.test", address: "node-b.example.test" },
        { name: "node-c.example.test", address: "node-c.example.test" },
      ],
      bootstrap: { clusterId: "c", winner: "node-a.example.test" },
    }),
  ).resolves.toEqual({ completed: ["node-b.example.test"] });
});

test("recovers two joiners sequentially before publishing completion", async () => {
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
                wsrep_cluster_size: "3",
                wsrep_local_state_comment: "Synced",
                wsrep_ready: "ON",
                wsrep_cluster_status: "Primary",
              },
            },
          }),
        }
      : { ok: true, status: 202, json: async () => ({ ok: true, data: { status: "ready" } }) },
  );
  const publishRecovery = jest.fn(async () => true);
  const joiner = createSupervisorRecoveryJoiner({
    identity: { name: "node-a.example.test" },
    token: "secret",
    timeoutMs: 10,
    recoveryState: { set: jest.fn() },
    recoveryAudit: {},
    publishRecovery,
    log: {},
    fetchImpl,
  });
  await expect(
    joiner({
      bootstrap: { epoch: 2, clusterId: "c", winner: "node-b.example.test" },
      members: [
        { name: "node-a.example.test", address: "node-a.example.test" },
        { name: "node-b.example.test", address: "node-b.example.test" },
        { name: "node-c.example.test", address: "node-c.example.test" },
      ],
    }),
  ).resolves.toEqual({ completed: ["node-b.example.test", "node-c.example.test"] });
  expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
    "http://node-b.example.test:8080/api/v1/cluster/cold-recovery/join",
    "http://node-b.example.test:8080/api/v1/cluster/status",
    "http://node-c.example.test:8080/api/v1/cluster/cold-recovery/join",
    "http://node-c.example.test:8080/api/v1/cluster/status",
  ]);
  expect(publishRecovery).toHaveBeenCalledTimes(1);
});

test("does not publish recovery when a joiner fails", async () => {
  const fetchImpl = jest.fn(async () => ({
    ok: false,
    status: 409,
    json: async () => ({ ok: false, error: "join refused", code: "JOIN_REFUSED" }),
  }));
  const publishRecovery = jest.fn();
  const joiner = createSupervisorRecoveryJoiner({
    identity: { name: "node-a.example.test" },
    token: "secret",
    timeoutMs: 10,
    recoveryState: { set: jest.fn() },
    recoveryAudit: { failure: jest.fn() },
    publishRecovery,
    log: { error: jest.fn() },
    fetchImpl,
  });
  await expect(
    joiner({
      bootstrap: { epoch: 3, clusterId: "c", winner: "node-b.example.test" },
      members: [
        { name: "node-a.example.test", address: "node-a.example.test" },
        { name: "node-b.example.test", address: "node-b.example.test" },
      ],
    }),
  ).rejects.toMatchObject({ code: "JOIN_REFUSED" });
  expect(publishRecovery).not.toHaveBeenCalled();
});

test("rejects a join that is acknowledged but not Primary and Synced", async () => {
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
                wsrep_local_state_comment: "Joining",
                wsrep_ready: "OFF",
                wsrep_cluster_status: "Non-Primary",
              },
            },
          }),
        }
      : { ok: true, status: 202, json: async () => ({ ok: true, data: { status: "ready" } }) },
  );
  const joiner = createSupervisorRecoveryJoiner({
    identity: { name: "node-a.example.test" },
    token: "secret",
    timeoutMs: 10,
    recoveryState: { set: jest.fn() },
    recoveryAudit: { failure: jest.fn() },
    log: { error: jest.fn() },
    fetchImpl,
  });
  await expect(
    joiner({
      bootstrap: { epoch: 4, clusterId: "c", winner: "node-b.example.test" },
      members: [
        { name: "node-a.example.test", address: "node-a.example.test" },
        { name: "node-b.example.test", address: "node-b.example.test" },
      ],
    }),
  ).rejects.toMatchObject({ code: "JOINER_NOT_READY", node: "node-b.example.test" });
});

test("rejects a join when status endpoint fails or returns invalid JSON", async () => {
  const fetchImpl = jest.fn(async (url) =>
    url.endsWith("/status")
      ? {
          ok: false,
          status: 503,
          json: async () => {
            throw new Error("invalid json");
          },
        }
      : { ok: true, status: 202, json: async () => ({ ok: true, data: {} }) },
  );
  const joiner = createSupervisorRecoveryJoiner({
    identity: { name: "node-a.example.test" },
    token: "secret",
    timeoutMs: 10,
    recoveryState: { set: jest.fn() },
    recoveryAudit: { failure: jest.fn() },
    log: { error: jest.fn() },
    fetchImpl,
  });
  await expect(
    joiner({
      bootstrap: { epoch: 5, clusterId: "c", winner: "node-b.example.test" },
      members: [
        { name: "node-a.example.test", address: "node-a.example.test" },
        {
          name: "node-b.example.test",
          address: "node-b.example.test",
          url: "http://node-b.example.test/",
        },
      ],
    }),
  ).rejects.toMatchObject({ code: "JOINER_NOT_READY" });
});

test("accepts direct status data and preserves a custom join URL", async () => {
  const fetchImpl = jest.fn(async (url) =>
    url.endsWith("/status")
      ? {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            data: {
              wsrep_cluster_state_uuid: "c",
              wsrep_cluster_size: "3",
              wsrep_local_state_comment: "Synced",
              wsrep_ready: "ON",
              wsrep_cluster_status: "Primary",
            },
          }),
        }
      : { ok: true, status: 202, json: async () => ({ ok: true, data: {} }) },
  );
  const joiner = createSupervisorRecoveryJoiner({
    identity: { name: "node-c.example.test" },
    token: "secret",
    timeoutMs: 10,
    recoveryState: { set: jest.fn() },
    recoveryAudit: {},
    fetchImpl,
  });
  await expect(
    joiner({
      bootstrap: { clusterId: "c", winner: "node-a.example.test" },
      members: [
        { name: "node-a.example.test", address: "node-a.example.test" },
        { name: "node-b.example.test", address: "node-b.example.test", url: "http://custom/" },
        { name: "node-c.example.test", address: "node-c.example.test" },
      ],
    }),
  ).resolves.toEqual({ completed: ["node-a.example.test", "node-b.example.test"] });
  expect(fetchImpl.mock.calls[2][0]).toBe("http://custom/api/v1/cluster/cold-recovery/join");
});

test("rejects a successful status response without status data", async () => {
  const fetchImpl = jest.fn(async (url) =>
    url.endsWith("/status")
      ? { ok: true, status: 200, json: async () => ({ ok: true }) }
      : { ok: true, status: 202, json: async () => ({ ok: true, data: {} }) },
  );
  const joiner = createSupervisorRecoveryJoiner({
    identity: { name: "node-c.example.test" },
    token: "secret",
    timeoutMs: 10,
    recoveryState: { set: jest.fn() },
    recoveryAudit: { failure: jest.fn() },
    log: { error: jest.fn() },
    fetchImpl,
  });
  await expect(
    joiner({
      bootstrap: { clusterId: "c", winner: "node-a.example.test" },
      members: [
        { name: "node-a.example.test", address: "node-a.example.test" },
        { name: "node-b.example.test", address: "node-b.example.test" },
        { name: "node-c.example.test", address: "node-c.example.test" },
      ],
    }),
  ).rejects.toMatchObject({ code: "JOINER_NOT_READY" });
});

{
  const nodes = [
    { name: "elera-0.example.test", url: "http://elera-0.example.test", local: true },
    { name: "elera-1.example.test", url: "http://elera-1.example.test" },
    { name: "elera-2.example.test", url: "http://elera-2.example.test" },
  ];
  const evidence = {
    "elera-0.example.test": {
      node: "elera-0.example.test",
      state: { uuid: "cluster", seqno: 11, safeToBootstrap: false },
      active: false,
    },
    "elera-1.example.test": {
      node: "elera-1.example.test",
      state: { uuid: "cluster", seqno: 14, safeToBootstrap: false },
      active: false,
    },
    "elera-2.example.test": {
      node: "elera-2.example.test",
      state: { uuid: "cluster", seqno: 12, safeToBootstrap: false },
      active: false,
    },
  };
  const withEvidence = (item) => ({ ...item, generation: 1, observedAt: new Date().toISOString() });
  const store = () => ({
    value: undefined,
    async read() {
      return this.value;
    },
    async write(value) {
      this.value = value;
      return value;
    },
  });

  __fixture3_test("three supervisors converge on the same epoch and winner", async () => {
    const protocols = nodes.map((local) =>
      __fixture3_createColdRecoveryProtocol({
        nodes: nodes.map((node) => ({ ...node, local: node.name === local.name })),
        localEvidence: async () => withEvidence(evidence[local.name]),
        fetchEvidence: async (url) => withEvidence(evidence[url.replace("http://", "")]),
        store: store(),
      }),
    );
    const plans = await Promise.all(protocols.map((protocol) => protocol.plan()));
    __fixture3_expect(new Set(plans.map((plan) => plan.epoch)).size).toBe(1);
    __fixture3_expect(new Set(plans.map((plan) => plan.winner.node))).toEqual(
      new Set(["elera-1.example.test"]),
    );
  });

  __fixture3_test("quorum loss blocks authorization and retry recollects evidence", async () => {
    const recoveryStore = store();
    const protocol = __fixture3_createColdRecoveryProtocol({
      nodes,
      localEvidence: async () => withEvidence(evidence["elera-0.example.test"]),
      fetchEvidence: async () => {
        throw new Error("partition");
      },
      store: recoveryStore,
    });
    await __fixture3_expect(protocol.plan()).resolves.toMatchObject({
      mode: "blocked",
      reason: "partition",
    });
    await __fixture3_expect(protocol.retry()).resolves.toMatchObject({
      mode: "blocked",
      reason: "partition",
    });
    __fixture3_expect(recoveryStore.value.phase).toBe("blocked");
  });

  __fixture3_test("one shared lease grants bootstrap authority to only one winner", async () => {
    const directory = await __fixture3_mkdtemp(
      __fixture3_join(__fixture3_tmpdir(), "elera-epoch-"),
    );
    const lease = __fixture3_createRecoveryLease(__fixture3_join(directory, "lease.json"));
    const claims = await Promise.all(
      ["elera-0.example.test", "elera-1.example.test", "elera-2.example.test"].map((_winner) =>
        lease.claim({ epoch: "cluster:epoch", winner: "elera-1.example.test" }),
      ),
    );
    __fixture3_expect(claims.filter((claim) => claim.granted && !claim.existing)).toHaveLength(1);
    await __fixture3_rm(directory, { recursive: true, force: true });
  });
}
