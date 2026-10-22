import { expect, jest, test } from "@jest/globals";
import { recoveryLeaseClaims } from "../../../../test-fixtures/recovery-lease-claims.mjs";
import { createCandidateRecoveryPlan } from "../../../../src/cluster/cold-bootstrap/protocol/candidate-plan.mjs";

jest.useFakeTimers();
test("creates an epoch from the unique quorum winner", async () => {
  const evidence = [
    { node: "a.example.test", uuid: "cluster", seqno: 8 },
    { node: "b.example.test", uuid: "cluster", seqno: 7 },
  ];
  const persist = jest.fn();
  const result = await createCandidateRecoveryPlan({
    nodes: evidence.map(({ node }) => ({ name: node })),
    evidence,
    now: () => new Date("2026-10-14T00:00:00Z"),
    persist,
    publishEvent: jest.fn(),
    debug: jest.fn(),
    setCurrent: jest.fn(),
    blocked: jest.fn(),
  });
  expect(result).toMatchObject({
    eligible: true,
    mode: "bootstrap",
    winner: { node: "a.example.test" },
  });
  expect(persist).toHaveBeenCalledWith(expect.objectContaining({ epoch: result.epoch }));
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

test("selects the strongest surviving UUID history and records divergent stale nodes", async () => {
  const stale = {
    ...recoveryEvidence("a.example.test", 47),
    state: { uuid: "old-history", seqno: 47, safeToBootstrap: true },
  };
  const winner = {
    ...recoveryEvidence("b.example.test", 5112),
    state: { uuid: "current-history", seqno: 5112, safeToBootstrap: false },
  };
  const follower = {
    ...recoveryEvidence("c.example.test", 138),
    state: { uuid: "current-history", seqno: 138, safeToBootstrap: false },
  };
  const protocol = createColdRecoveryProtocol({
    nodes: [
      { name: "a.example.test", local: true },
      { name: "b.example.test", url: "http://b.example.test" },
      { name: "c.example.test", url: "http://c.example.test" },
    ],
    localEvidence: async () => stale,
    fetchEvidence: async (url) => (url.endsWith("b.example.test") ? winner : follower),
    store: {
      async read() {},
      async write(value) {
        return value;
      },
    },
  });
  await expect(protocol.plan()).resolves.toMatchObject({
    eligible: true,
    mode: "bootstrap",
    winner: { node: "b.example.test" },
    divergent: expect.arrayContaining([expect.objectContaining({ node: "a.example.test" })]),
  });
});

test("does not let safe markers override recovery ordering", async () => {
  const item = (node) => ({
    ...recoveryEvidence(node, 2),
    state: { uuid: "u", seqno: 2, safeToBootstrap: true },
  });
  const protocol = createColdRecoveryProtocol({
    nodes: [
      { name: "a.example.test", local: true },
      { name: "b.example.test", url: "http://b.example.test" },
    ],
    localEvidence: async () => item("a.example.test"),
    fetchEvidence: async () => item("b.example.test"),
    store: {
      async read() {},
      async write(value) {
        return value;
      },
    },
  });
  await expect(protocol.plan()).resolves.toMatchObject({
    eligible: true,
    mode: "bootstrap",
    winner: { node: "a.example.test" },
  });
});

test("blocks when the candidate cannot be revalidated before bootstrap", async () => {
  const store = {
    value: undefined,
    async read() {
      return this.value;
    },
    async write(value) {
      this.value = value;
      return value;
    },
  };
  let unavailable = false;
  const protocol = createColdRecoveryProtocol({
    nodes: [{ name: "a.example.test", local: true }],
    localEvidence: async () => {
      if (unavailable) throw new Error("revalidation unavailable");
      return recoveryEvidence("a.example.test", 1);
    },
    fetchEvidence: async () => undefined,
    store,
  });
  const plan = await protocol.plan();
  await protocol.authorize({
    epoch: plan.epoch,
    leaseClaims: recoveryLeaseClaims(plan.epoch, "a.example.test", ["a.example.test"]),
  });
  unavailable = true;
  await expect(
    protocol.beginBootstrap({ epoch: plan.epoch, winner: "a.example.test" }),
  ).rejects.toMatchObject({
    statusCode: 409,
  });
  await expect(protocol.status()).resolves.toMatchObject({
    phase: "blocked",
    reason: "revalidation unavailable",
  });
});

test("rejects completion from a different winner or cluster", async () => {
  const { protocol } = makeProtocol();
  const plan = await protocol.plan();
  await expect(
    protocol.complete({
      epoch: plan.epoch,
      winner: "b.example.test",
      clusterId: "cluster",
      membership: ["a.example.test", "b.example.test", "c.example.test"],
    }),
  ).rejects.toMatchObject({ statusCode: 409 });
  await expect(
    protocol.complete({
      epoch: plan.epoch,
      winner: "a.example.test",
      clusterId: "other",
      membership: ["a.example.test", "b.example.test", "c.example.test"],
    }),
  ).rejects.toMatchObject({ statusCode: 409 });
});

test("uses the configured node value when a remote URL is omitted", async () => {
  const protocol = createColdRecoveryProtocol({
    nodes: [{ name: "a.example.test", local: false }],
    localEvidence: async () => recoveryEvidence("a.example.test", 1),
    fetchEvidence: async (node) => recoveryEvidence(node.name, 1),
    store: {
      async read() {},
      async write(value) {
        return value;
      },
    },
  });
  await expect(protocol.evidence()).resolves.toMatchObject([{ node: "a.example.test" }]);
});
