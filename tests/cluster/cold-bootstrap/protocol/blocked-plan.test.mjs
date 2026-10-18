import { expect, jest, test } from "@jest/globals";
import { saveBlockedRecoveryPlan } from "../../../../src/cluster/cold-bootstrap/protocol/blocked-plan.mjs";

jest.useFakeTimers();
test("persists and publishes a blocked recovery plan", async () => {
  const persist = jest.fn();
  const publishEvent = jest.fn();
  const setCurrent = jest.fn();
  const now = () => new Date("2026-10-14T00:00:00Z");
  const result = await saveBlockedRecoveryPlan({
    reason: "peer evidence is missing",
    code: "EVIDENCE_MISSING",
    now,
    persist,
    publishEvent,
    setCurrent,
  });
  expect(result).toMatchObject({ eligible: false, mode: "blocked", phase: "blocked" });
  expect(setCurrent).toHaveBeenCalledWith(expect.objectContaining({ phase: "blocked" }));
  expect(persist).toHaveBeenCalledWith(expect.objectContaining({ phase: "blocked" }));
  expect(publishEvent).toHaveBeenCalledWith(
    expect.objectContaining({ type: "recovery.refused", code: "EVIDENCE_MISSING" }),
  );
});

import { createColdRecoveryProtocol } from "../../../../src/cluster/cold-bootstrap/protocol.mjs";

const recoveryEvidence = (node, seqno) => ({
  node,
  state: { uuid: "cluster", seqno, safeToBootstrap: false },
  active: false,
  generation: 1,
  observedAt: new Date().toISOString(),
});

test("blocks equal-authority divergent histories and exposes pending status", async () => {
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
  const same = (node) => ({
    ...recoveryEvidence(node, 4),
    state: { uuid: node === "a.example.test" ? "u1" : "u2", seqno: 4, safeToBootstrap: false },
  });
  const protocol = createColdRecoveryProtocol({
    nodes: [
      { name: "a.example.test", local: true },
      { name: "b.example.test", url: "http://b.example.test" },
    ],
    localEvidence: async () => same("a.example.test"),
    fetchEvidence: async () => same("b.example.test"),
    store,
  });
  await expect(protocol.plan()).resolves.toMatchObject({
    eligible: false,
    mode: "blocked",
    code: "SPLIT_BRAIN",
  });
  await expect(protocol.status()).resolves.toMatchObject({ phase: "blocked" });
});

test("blocks changed evidence after authorization", async () => {
  let sequence = 0;
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
    localEvidence: async () => recoveryEvidence("a.example.test", ++sequence),
    fetchEvidence: async (node) => recoveryEvidence(node.name, 1),
    store,
  });
  const plan = await protocol.plan();
  await protocol.authorize({ epoch: plan.epoch, acknowledgements: ["a.example.test"] });
  await expect(
    protocol.beginBootstrap({ epoch: plan.epoch, winner: "a.example.test" }),
  ).rejects.toMatchObject({
    statusCode: 409,
    code: "RECOVERY_EVIDENCE_CHANGED",
  });
});

test("blocks a quorum when no node has a recoverable sequence", async () => {
  const noPosition = (node) => ({
    ...recoveryEvidence(node, -1),
    state: { uuid: "u", seqno: -1, safeToBootstrap: true },
  });
  const protocol = createColdRecoveryProtocol({
    nodes: [
      { name: "a.example.test", local: true },
      { name: "b.example.test", url: "http://b.example.test" },
    ],
    localEvidence: async () => noPosition("a.example.test"),
    fetchEvidence: async () => noPosition("b.example.test"),
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
    reason: "no recoverable seqno exists",
  });
});
