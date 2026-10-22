import { expect, jest, test } from "@jest/globals";
import { createRecoveryEpoch } from "../../../../src/cluster/cold-bootstrap/recovery/epoch/create.mjs";
import { authorizeRecoveryEpoch } from "../../../../src/cluster/cold-bootstrap/protocol/authorization.mjs";
import { recoveryLeaseClaims } from "../../../../test-fixtures/recovery-lease-claims.mjs";

jest.useFakeTimers();
const epoch = () =>
  createRecoveryEpoch({
    clusterId: "cluster",
    evidence: [{ node: "a.example.test", uuid: "cluster", seqno: 8 }],
    winner: { node: "a.example.test", uuid: "cluster", seqno: 8 },
    quorum: ["a.example.test"],
  });

test("authorizes a valid epoch with authenticated lease claims", async () => {
  const existing = epoch();
  const persist = jest.fn();
  const result = await authorizeRecoveryEpoch(
    {
      epoch: existing.epoch,
      leaseClaims: recoveryLeaseClaims(existing.epoch, existing.winner.node, existing.quorum),
    },
    {
      read: async () => existing,
      persist,
      now: () => new Date("2026-10-14T00:00:00Z"),
      publishEvent: jest.fn(),
      debug: jest.fn(),
      setCurrent: jest.fn(),
    },
  );
  expect(result.phase).toBe("authorized");
  expect(persist).toHaveBeenCalledWith(result, existing.epoch);
});

test("rejects missing or malformed authenticated lease claims", async () => {
  await expect(authorizeRecoveryEpoch()).rejects.toThrow();
  const existing = epoch();
  await expect(
    authorizeRecoveryEpoch(
      { epoch: existing.epoch, leaseClaims: "invalid" },
      {
        read: async () => existing,
        persist: jest.fn(),
        now: () => new Date("2026-10-14T00:00:00Z"),
        publishEvent: jest.fn(),
        debug: jest.fn(),
        setCurrent: jest.fn(),
      },
    ),
  ).rejects.toThrow();
});

import { createColdRecoveryProtocol } from "../../../../src/cluster/cold-bootstrap/protocol.mjs";

const recoveryEvidence = (node, seqno) => ({
  node,
  state: { uuid: "cluster", seqno, safeToBootstrap: false },
  active: false,
  generation: 1,
  observedAt: new Date().toISOString(),
});
const makeProtocol = () => {
  const store = {
    value: undefined,
    read: jest.fn(async function () {
      return this.value;
    }),
    write: jest.fn(async function (value) {
      this.value = value;
      return value;
    }),
  };
  const protocol = createColdRecoveryProtocol({
    nodes: [
      { name: "a.example.test", url: "http://a.example.test", local: true },
      { name: "b.example.test", url: "http://b.example.test" },
      { name: "c.example.test", url: "http://c.example.test" },
    ],
    localEvidence: async () => recoveryEvidence("a.example.test", 3),
    fetchEvidence: async (url) =>
      recoveryEvidence(url.includes("b.example.test") ? "b.example.test" : "c.example.test", 2),
    store,
  });
  return { protocol, store };
};

test("publishes lifecycle events for evidence, candidate, authorization, bootstrap, and completion", async () => {
  const events = [];
  let ready = false;
  const observed = (node, seqno) => ({
    ...recoveryEvidence(node, seqno),
    active: ready,
    galera: ready
      ? {
          clusterUuid: "cluster",
          clusterStatus: "Primary",
          localState: "Synced",
          ready: "ON",
          clusterSize: 3,
        }
      : undefined,
  });
  const eventProtocol = createColdRecoveryProtocol({
    nodes: [
      { name: "a.example.test", local: true },
      { name: "b.example.test", url: "http://b.example.test" },
      { name: "c.example.test", url: "http://c.example.test" },
    ],
    localEvidence: async () => observed("a.example.test", 3),
    fetchEvidence: async (url) => observed(new URL(url).hostname, 2),
    store: {
      value: undefined,
      async read() {
        return this.value;
      },
      async write(value) {
        this.value = value;
      },
    },
    publishEvent: async (event) => events.push(event),
  });
  const plan = await eventProtocol.plan();
  await eventProtocol.authorize({
    epoch: plan.epoch,
    leaseClaims: recoveryLeaseClaims(plan.epoch, "a.example.test", [
      "a.example.test",
      "b.example.test",
      "c.example.test",
    ]),
  });
  await eventProtocol.beginBootstrap({ epoch: plan.epoch, winner: "a.example.test" });
  ready = true;
  await eventProtocol.complete({
    epoch: plan.epoch,
    winner: "a.example.test",
    clusterId: "cluster",
    membership: ["a.example.test", "b.example.test", "c.example.test"],
  });
  expect(events.map((event) => event.type)).toEqual([
    "recovery.evidence-collected",
    "recovery.candidate-selected",
    "recovery.bootstrap-authorized",
    "recovery.bootstrap-started",
    "recovery.bootstrap-complete",
  ]);
});

test("requires the exact epoch and quorum before authorization", async () => {
  const { protocol } = makeProtocol();
  const plan = await protocol.plan();
  await expect(protocol.authorize({ epoch: "stale", leaseClaims: [] })).rejects.toMatchObject({
    statusCode: 409,
  });
  await expect(
    protocol.authorize({
      epoch: plan.epoch,
      leaseClaims: recoveryLeaseClaims(plan.epoch, "a.example.test", [
        "a.example.test",
        "b.example.test",
      ]),
    }),
  ).rejects.toThrow("full-cluster");
  await expect(
    protocol.authorize({
      epoch: plan.epoch,
      leaseClaims: recoveryLeaseClaims(plan.epoch, "a.example.test", [
        "a.example.test",
        "b.example.test",
        "c.example.test",
      ]),
    }),
  ).resolves.toMatchObject({
    phase: "authorized",
    acknowledgements: new Set(["a.example.test", "b.example.test", "c.example.test"]),
  });
});

test("requires the full configured acknowledgements for forced authorization", async () => {
  const { protocol } = makeProtocol();
  const plan = await protocol.plan();
  await expect(protocol.authorize({ epoch: plan.epoch, force: true })).rejects.toThrow(
    "full-cluster authorization",
  );
  await expect(
    protocol.authorize({
      epoch: plan.epoch,
      force: true,
      leaseClaims: recoveryLeaseClaims(plan.epoch, "a.example.test", [
        "a.example.test",
        "b.example.test",
        "c.example.test",
      ]),
    }),
  ).resolves.toMatchObject({ phase: "authorized", operatorForced: true });
});

test("rejects a reduced quorum even for forced authorization", async () => {
  const { protocol } = makeProtocol();
  const plan = await protocol.plan();
  await expect(
    protocol.authorize({
      epoch: plan.epoch,
      force: true,
      supervisorQuorum: 2,
      leaseClaims: recoveryLeaseClaims(plan.epoch, "a.example.test", [
        "a.example.test",
        "b.example.test",
      ]),
    }),
  ).rejects.toMatchObject({ statusCode: 400 });
});

test("rejects an invalid temporary supervisor quorum", async () => {
  const { protocol } = makeProtocol();
  const plan = await protocol.plan();
  await expect(
    protocol.authorize({ epoch: plan.epoch, force: true, supervisorQuorum: 0 }),
  ).rejects.toMatchObject({ statusCode: 400 });
});

test("rejects invalid completion and preserves the authorized epoch", async () => {
  const { protocol } = makeProtocol();
  const plan = await protocol.plan();
  await protocol.authorize({
    epoch: plan.epoch,
    leaseClaims: recoveryLeaseClaims(plan.epoch, "a.example.test", [
      "a.example.test",
      "b.example.test",
      "c.example.test",
    ]),
  });
  await expect(
    protocol.complete({
      epoch: plan.epoch,
      winner: "a.example.test",
      clusterId: "cluster",
      membership: ["a.example.test"],
    }),
  ).rejects.toMatchObject({ statusCode: 409 });
  await expect(
    protocol.beginBootstrap({ epoch: plan.epoch, winner: "wrong" }),
  ).rejects.toMatchObject({ statusCode: 409 });
  await expect(protocol.authorize({ epoch: "old", leaseClaims: [] })).rejects.toMatchObject({
    statusCode: 409,
  });
});
