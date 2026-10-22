import { expect, jest, test } from "@jest/globals";
import { createColdRecoveryProtocol } from "../../../src/cluster/cold-bootstrap/protocol.mjs";

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
  await expect(
    protocol.authorize({ epoch: "wrong", acknowledgements: "a.example.test" }),
  ).rejects.toMatchObject({ statusCode: 409 });
  await expect(
    protocol.complete({ epoch: "wrong", membership: ["a.example.test"] }),
  ).rejects.toMatchObject({
    statusCode: 409,
  });
  const plan = await protocol.plan();
  await expect(
    protocol.authorize({ epoch: plan.epoch, acknowledgements: "not-an-array" }),
  ).rejects.toThrow("full-cluster");
  await expect(protocol.beginBootstrap()).rejects.toMatchObject({ statusCode: 409 });
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
    protocol.authorize({ epoch: plan.epoch, acknowledgements: ["a.example.test"] }),
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
