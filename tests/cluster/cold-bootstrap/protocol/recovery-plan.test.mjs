import { expect, jest, test } from "@jest/globals";
import { createRecoveryPlanner } from "../../../../src/cluster/cold-bootstrap/protocol/recovery-plan.mjs";

jest.useFakeTimers();
test("returns a join plan when active primary evidence exists", async () => {
  const evidence = [{ node: "db.example.test", galera: { clusterSize: 3 } }];
  const publishEvent = jest.fn();
  const planner = createRecoveryPlanner({
    nodes: [{ name: "db.example.test" }],
    collect: async () => ({ evidence }),
    isActivePrimary: () => true,
    now: () => new Date(),
    persist: jest.fn(),
    publishEvent,
    debug: jest.fn(),
    setCurrent: jest.fn(),
  });
  await expect(planner.plan()).resolves.toMatchObject({
    eligible: true,
    mode: "join",
    expectedMembership: 3,
    evidence,
  });
  expect(publishEvent).toHaveBeenCalledWith({ type: "recovery.evidence-collected", evidence });
  const unknownSize = makePlanner({
    nodes: [{ name: "db.example.test" }],
    collect: async () => ({ evidence: [{ node: "db.example.test", galera: {} }] }),
    isActivePrimary: () => true,
  });
  await expect(unknownSize.planner.plan()).resolves.toMatchObject({
    eligible: true,
    mode: "join",
  });
});

const makePlanner = ({ nodes, collect, isActivePrimary = () => false }) => {
  const persist = jest.fn();
  const publishEvent = jest.fn();
  const setCurrent = jest.fn();
  return {
    planner: createRecoveryPlanner({
      nodes,
      collect,
      isActivePrimary,
      now: () => new Date("2026-10-14T00:00:00Z"),
      persist,
      publishEvent,
      debug: jest.fn(),
      setCurrent,
    }),
    persist,
    publishEvent,
    setCurrent,
  };
};

test("blocks collection failures and partial evidence with useful reasons", async () => {
  const nodes = [{ name: "a.example.test" }, { name: "b.example.test" }];
  const typed = makePlanner({
    nodes,
    collect: async () => {
      throw Object.assign(new Error("identity mismatch"), { code: "IDENTITY_MISMATCH" });
    },
  });
  await expect(typed.planner.plan()).resolves.toMatchObject({
    mode: "blocked",
    code: "IDENTITY_MISMATCH",
  });
  const untyped = makePlanner({
    nodes,
    collect: async () => {
      throw new Error("offline");
    },
  });
  await expect(untyped.planner.plan()).resolves.toMatchObject({
    code: "RECOVERY_EVIDENCE_UNAVAILABLE",
  });

  const partial = makePlanner({
    nodes,
    collect: async () => ({ evidence: [{ node: "a.example.test" }] }),
  });
  await expect(partial.planner.plan()).resolves.toMatchObject({
    code: "INSUFFICIENT_RECOVERY_EVIDENCE",
    reason: expect.stringContaining("validated majority"),
  });
  const mismatched = makePlanner({
    nodes,
    collect: async () => ({
      evidence: [{ node: "a.example.test" }],
      failures: [
        {
          code: "RECOVERY_EVIDENCE_IDENTITY_MISMATCH",
          message: "peer identity mismatch",
        },
      ],
    }),
  });
  await expect(mismatched.planner.plan()).resolves.toMatchObject({
    code: "RECOVERY_EVIDENCE_IDENTITY_MISMATCH",
    reason: "peer identity mismatch",
  });
});

test("saves eligible candidates and blocks histories without quorum", async () => {
  const nodes = [{ name: "a.example.test" }, { name: "b.example.test" }];
  const evidence = [
    { node: "a.example.test", uuid: "cluster", seqno: 8 },
    { node: "b.example.test", uuid: "cluster", seqno: 7 },
  ];
  const eligible = makePlanner({ nodes, collect: async () => ({ evidence }) });
  await expect(eligible.planner.plan()).resolves.toMatchObject({
    eligible: true,
    mode: "bootstrap",
    winner: { node: "a.example.test" },
  });
  expect(eligible.persist).toHaveBeenCalled();
  expect(eligible.publishEvent).toHaveBeenCalledWith(
    expect.objectContaining({ type: "recovery.candidate-selected" }),
  );

  const inactive = makePlanner({
    nodes: [{ name: "a.example.test" }],
    collect: async () => ({ evidence: [{ node: "a.example.test", uuid: "cluster", seqno: -1 }] }),
  });
  await expect(inactive.planner.plan()).resolves.toMatchObject({
    mode: "blocked",
    reason: "no recoverable seqno exists",
  });
});

import { createColdRecoveryProtocol } from "../../../../src/cluster/cold-bootstrap/protocol.mjs";

const recoveryEvidence = (node, seqno) => ({
  node,
  state: { uuid: "cluster", seqno, safeToBootstrap: false },
  active: false,
  generation: 1,
  observedAt: new Date().toISOString(),
});

test("joins when a peer already reports an active Primary component", async () => {
  const active = {
    ...recoveryEvidence("b", 2),
    active: true,
    galera: {
      clusterUuid: "cluster",
      clusterStatus: "Primary",
      localState: "Synced",
      ready: true,
      clusterSize: 2,
    },
  };
  const store = {
    async read() {},
    async write(value) {
      return value;
    },
  };
  const protocol = createColdRecoveryProtocol({
    nodes: [
      { name: "a", local: true },
      { name: "b", url: "http://b" },
    ],
    localEvidence: async () => recoveryEvidence("a", 1),
    fetchEvidence: async () => active,
    store,
  });
  await expect(protocol.plan()).resolves.toMatchObject({
    eligible: true,
    mode: "join",
    reason: "primary component previously exists",
    expectedMembership: 2,
  });
});
