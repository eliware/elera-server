import { expect, jest, test } from "@jest/globals";
import { createColdRecoveryProtocol } from "../../../src/cluster/cold-bootstrap/protocol.mjs";
import { recoveryLeaseClaims } from "../../../test-fixtures/recovery-lease-claims.mjs";

jest.useFakeTimers();
const evidence = (node, seqno) => ({
  node,
  state: { uuid: "cluster", seqno, safeToBootstrap: false },
  active: false,
  generation: 1,
  observedAt: new Date().toISOString(),
});

test("validates required protocol dependencies and exposes collected evidence", async () => {
  expect(() => createColdRecoveryProtocol()).toThrow("dependencies are required");
  expect(() =>
    createColdRecoveryProtocol({
      nodes: [],
      localEvidence: jest.fn(),
      fetchEvidence: jest.fn(),
      store: {},
    }),
  ).toThrow("dependencies are required");
  const local = evidence("a.example.test", 3);
  const protocol = createColdRecoveryProtocol({
    nodes: [{ name: "a.example.test", local: true }],
    localEvidence: async () => local,
    fetchEvidence: async () => local,
    store: {
      async read() {},
      async write(value) {
        return value;
      },
    },
  });
  await expect(protocol.evidence()).resolves.toMatchObject([
    { node: "a.example.test", uuid: "cluster", seqno: 3 },
  ]);
});

test("normalizes top-level evidence and rejects unknown completion epochs", async () => {
  const item = {
    node: "a.example.test",
    uuid: "cluster",
    seqno: 1,
    savedSeqno: 1,
    recoveredSeqno: 1,
    safeToBootstrap: false,
    active: false,
    generation: 1,
    observedAt: new Date().toISOString(),
    dataDirectory: { valid: true },
  };
  const store = {
    async read() {},
    async write(value) {
      return value;
    },
  };
  const protocol = createColdRecoveryProtocol({
    nodes: [{ name: "a.example.test", local: true }],
    localEvidence: async () => item,
    fetchEvidence: async () => item,
    store,
  });
  await expect(protocol.plan()).resolves.toMatchObject({ eligible: true });
  await expect(protocol.authorize({ epoch: "wrong", leaseClaims: [] })).rejects.toMatchObject({
    statusCode: 409,
  });
  await expect(
    protocol.complete({ epoch: "wrong", membership: ["a.example.test"] }),
  ).rejects.toMatchObject({
    statusCode: 409,
  });
  const plan = await protocol.plan();
  expect(plan).toMatchObject({ eligible: true, phase: "evidence" });
  await expect(
    protocol.authorize({ epoch: plan.epoch, leaseClaims: "not-an-array" }),
  ).rejects.toThrow("authenticated recovery lease claims");
  await expect(protocol.beginBootstrap()).rejects.toMatchObject({ statusCode: 409 });
});

test("rejects forged lease names and unauthenticated claims", async () => {
  const store = {
    async read() {},
    async write(value) {
      return value;
    },
  };
  const protocol = createColdRecoveryProtocol({
    nodes: [
      { name: "a.example.test", local: true },
      { name: "b.example.test", url: "http://b.example.test" },
      { name: "c.example.test", url: "http://c.example.test" },
    ],
    localEvidence: async () => evidence("a.example.test", 3),
    fetchEvidence: async (url) => evidence(new URL(url).hostname, 2),
    store,
  });
  const plan = await protocol.plan();
  expect(plan).toMatchObject({ eligible: true, phase: "evidence" });
  await expect(
    protocol.authorize({
      epoch: plan.epoch,
      acknowledgements: ["a.example.test", "b.example.test", "c.example.test"],
    }),
  ).rejects.toThrow("full-cluster authorization");
  await expect(
    protocol.authorize({
      epoch: plan.epoch,
      leaseClaims: [
        {
          member: "a.example.test",
          epoch: plan.epoch,
          winner: "a.example.test",
          granted: true,
          authenticated: false,
        },
      ],
    }),
  ).rejects.toMatchObject({ statusCode: 403 });
});

test("keeps the persisted epoch when authorization persistence fails", async () => {
  const store = {
    value: undefined,
    async read() {
      return this.value;
    },
    async write(value) {
      if (value.phase === "authorized") throw new Error("disk failure");
      this.value = value;
      return value;
    },
  };
  const protocol = createColdRecoveryProtocol({
    nodes: [{ name: "a.example.test", local: true }],
    localEvidence: async () => evidence("a.example.test", 3),
    fetchEvidence: async () => {},
    store,
  });
  const plan = await protocol.plan();
  expect(plan).toMatchObject({ eligible: true, phase: "evidence" });
  await expect(
    protocol.authorize({
      epoch: plan.epoch,
      leaseClaims: recoveryLeaseClaims(plan.epoch, "a.example.test", ["a.example.test"]),
    }),
  ).rejects.toThrow("disk failure");
  await expect(protocol.status()).resolves.toMatchObject({ phase: "evidence" });
});

test("fails closed when evidence collection throws and can retry with fresh evidence", async () => {
  let fail = true;
  const events = [];
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
  const protocol = createColdRecoveryProtocol({
    nodes: [{ name: "a.example.test", local: true }],
    localEvidence: async () => {
      if (fail)
        throw Object.assign(new Error("data directory unavailable"), {
          code: "DATA_DIRECTORY_INVALID",
        });
      return evidence("a.example.test", 1);
    },
    fetchEvidence: async () => undefined,
    store,
    publishEvent: async (event) => events.push(event),
  });
  await expect(protocol.plan()).resolves.toMatchObject({
    mode: "blocked",
    code: "DATA_DIRECTORY_INVALID",
  });
  fail = false;
  await expect(protocol.retry()).resolves.toMatchObject({ mode: "bootstrap", eligible: true });
  expect(events.map(({ type }) => type)).toEqual([
    "recovery.refused",
    "recovery.evidence-collected",
    "recovery.candidate-selected",
  ]);
});

test("uses the default unavailable code for an untyped evidence failure", async () => {
  const protocol = createColdRecoveryProtocol({
    nodes: [{ name: "a.example.test", local: true }],
    localEvidence: async () => {
      throw new Error("temporary failure");
    },
    fetchEvidence: async () => undefined,
    store: {
      async read() {},
      async write(value) {
        return value;
      },
    },
  });
  await expect(protocol.plan()).resolves.toMatchObject({
    mode: "blocked",
    code: "RECOVERY_EVIDENCE_UNAVAILABLE",
  });
});

test("authorizes a recovery epoch and preserves identity mismatch refusals on retry", async () => {
  const stored = { value: undefined };
  const debug = jest.fn();
  const item = {
    node: "a.example.test",
    uuid: "cluster",
    seqno: 1,
    savedSeqno: 1,
    recoveredSeqno: 1,
    safeToBootstrap: false,
    active: false,
    generation: 1,
    observedAt: new Date().toISOString(),
    dataDirectory: { valid: true },
  };
  const protocol = createColdRecoveryProtocol({
    nodes: [{ name: "a.example.test", local: true }],
    localEvidence: async () => item,
    fetchEvidence: async () => item,
    store: {
      async read() {
        return stored.value;
      },
      async write(value) {
        stored.value = value;
        return value;
      },
    },
    log: { debug },
  });
  const plan = await protocol.plan();
  await expect(
    protocol.authorize({
      epoch: plan.epoch,
      leaseClaims: recoveryLeaseClaims(plan.epoch, "a.example.test", ["a.example.test"]),
    }),
  ).resolves.toMatchObject({ phase: "authorized" });
  expect(debug).toHaveBeenCalled();

  const mismatched = createColdRecoveryProtocol({
    nodes: [{ name: "a.example.test", local: true }],
    localEvidence: async () => {
      throw Object.assign(new Error("evidence identity mismatch"), {
        code: "RECOVERY_EVIDENCE_IDENTITY_MISMATCH",
      });
    },
    fetchEvidence: async () => undefined,
    store: {
      async read() {},
      async write(value) {
        return value;
      },
    },
  });
  const refusal = await mismatched.plan();
  expect(refusal.code).toBe("RECOVERY_EVIDENCE_IDENTITY_MISMATCH");
  await expect(mismatched.retry()).resolves.toMatchObject({
    code: "RECOVERY_EVIDENCE_IDENTITY_MISMATCH",
    phase: "blocked",
  });
});
