import { expect, jest, test } from "@jest/globals";
import { createRecoveryEvidenceCollector } from "../../../../src/cluster/cold-bootstrap/protocol/evidence-collection.mjs";

jest.useFakeTimers();
test("collects and validates evidence from local and remote nodes", async () => {
  const fetchEvidence = jest.fn(async (_url, node) => recoveryEvidence(node, 2));
  const collector = createRecoveryEvidenceCollector({
    nodes: [
      { name: "a.example.test", local: true },
      { name: "b.example.test", url: "http://b.example.test.example.test" },
    ],
    localEvidence: async () => recoveryEvidence("a.example.test", 3),
    fetchEvidence,
    now: () => new Date(),
    maxEvidenceAgeMs: 10_000,
  });
  await expect(collector.collect()).resolves.toMatchObject({
    evidence: [
      { node: "a.example.test", seqno: 3 },
      { node: "b.example.test", seqno: 2 },
    ],
    activePrimary: false,
    partial: false,
  });
  expect(fetchEvidence).toHaveBeenCalledWith(
    "http://b.example.test.example.test",
    "b.example.test",
  );
});
test("detects an active primary before recovery evidence validation", async () => {
  const collector = createRecoveryEvidenceCollector({
    nodes: [{ name: "a.example.test", local: true }, { name: "b.example.test" }],
    localEvidence: async () => ({
      ...recoveryEvidence("a.example.test", 3),
      active: true,
      galera: {
        clusterUuid: "cluster",
        clusterStatus: "Primary",
        localState: "Synced",
        ready: "ON",
      },
    }),
    fetchEvidence: async () => {
      throw new Error("peer unavailable");
    },
    now: () => new Date(),
    maxEvidenceAgeMs: 10_000,
  });
  await expect(collector.collect()).resolves.toMatchObject({ activePrimary: true });
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
      { name: "b.example.test", url: "http://b.example.test.example.test" },
      { name: "c.example.test", url: "http://c.example.test.example.test" },
    ],
    localEvidence: async () => recoveryEvidence("a.example.test", 3),
    fetchEvidence: async (url) =>
      recoveryEvidence(url.includes("b.example.test") ? "b.example.test" : "c.example.test", 2),
    store,
  });
  return { protocol, store };
};
test("plans a deterministic epoch from complete peer evidence", async () => {
  const { protocol } = makeProtocol();
  await expect(protocol.plan()).resolves.toMatchObject({
    eligible: true,
    phase: "evidence",
    winner: { node: "a.example.test" },
    quorum: ["a.example.test", "b.example.test", "c.example.test"],
  });
});
test("logs the full candidate decision after full evidence", async () => {
  const debug = jest.fn();
  const current = (node, seqno) => ({
    ...recoveryEvidence(node, seqno),
    state: { uuid: "current", seqno, safeToBootstrap: false },
  });
  const protocol = createColdRecoveryProtocol({
    nodes: [
      { name: "a.example.test", local: true },
      { name: "b.example.test", url: "http://b.example.test" },
      { name: "c.example.test", url: "http://c.example.test" },
    ],
    localEvidence: async () => current("a.example.test", 10),
    fetchEvidence: async (url) =>
      ({
        "http://b.example.test": current("b.example.test", 9),
        "http://c.example.test": current("c.example.test", 8),
      })[url],
    store: {
      async read() {},
      async write(value) {
        return value;
      },
    },
    log: { debug },
  });
  await expect(protocol.plan()).resolves.toMatchObject({ eligible: true, divergent: [] });
  expect(debug).toHaveBeenCalledWith(
    "Recovery candidate decision complete",
    expect.objectContaining({ candidate: "a.example.test", divergentCount: 0 }),
  );
});
test("rejects stale or malformed evidence before candidate selection", async () => {
  const store = { async read() {}, async write() {} };
  const protocol = createColdRecoveryProtocol({
    nodes: [{ name: "a.example.test", local: true }],
    localEvidence: async () => ({
      node: "a.example.test",
      state: { uuid: "cluster", seqno: 1, safeToBootstrap: false },
      active: false,
      generation: 1,
      observedAt: new Date(Date.now() - 20000).toISOString(),
    }),
    fetchEvidence: async () => undefined,
    store,
    maxEvidenceAgeMs: 1000,
  });
  await expect(protocol.plan()).resolves.toMatchObject({
    mode: "blocked",
    code: "STALE_RECOVERY_EVIDENCE",
  });
});
test("joins an active Primary when another configured peer is unavailable", async () => {
  const active = {
    ...recoveryEvidence("b.example.test", 2),
    active: true,
    galera: { clusterUuid: "cluster", clusterStatus: "Primary", localState: "Synced", ready: true },
  };
  const protocol = createColdRecoveryProtocol({
    nodes: [
      { name: "a.example.test", local: true },
      { name: "b.example.test", url: "http://b.example.test" },
      { name: "c.example.test", url: "http://c.example.test" },
    ],
    localEvidence: async () => recoveryEvidence("a.example.test", 1),
    fetchEvidence: async (url) => {
      if (url.endsWith("c.example.test")) throw new Error("peer unavailable");
      return active;
    },
    store: {
      async read() {},
      async write(value) {
        return value;
      },
    },
  });
  await expect(protocol.plan()).resolves.toMatchObject({
    eligible: true,
    mode: "join",
    reason: "primary component previously exists",
  });
});
test("selects a winner from a validated majority when one peer is unavailable", async () => {
  const protocol = createColdRecoveryProtocol({
    nodes: [
      { name: "a.example.test", local: true },
      { name: "b.example.test", url: "http://b.example.test" },
      { name: "c.example.test", url: "http://c.example.test" },
    ],
    localEvidence: async () => recoveryEvidence("a.example.test", 5),
    fetchEvidence: async (url) => {
      if (url.endsWith("c.example.test"))
        throw Object.assign(new Error("peer unavailable"), { code: "PEER_UNAVAILABLE" });
      return recoveryEvidence("b.example.test", 4);
    },
    store: {
      async read() {},
      async write(value) {
        return value;
      },
    },
  });
  await expect(protocol.plan()).resolves.toMatchObject({
    eligible: false,
    mode: "blocked",
    code: "INSUFFICIENT_RECOVERY_EVIDENCE",
  });
});
