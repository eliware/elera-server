import { expect, jest, test } from "@jest/globals";
import { createRecoveryEpoch } from "../../../../src/cluster/cold-bootstrap/recovery/epoch/create.mjs";
import { transitionRecoveryEpoch } from "../../../../src/cluster/cold-bootstrap/recovery/epoch.mjs";
import { completeRecoveryEpoch } from "../../../../src/cluster/cold-bootstrap/protocol/completion.mjs";

jest.useFakeTimers();
test("rejects completion from a different winner", async () => {
  const evidenceEpoch = createRecoveryEpoch({
    clusterId: "cluster",
    evidence: [{ node: "a.example.test", uuid: "cluster", seqno: 8 }],
    winner: { node: "a.example.test", uuid: "cluster", seqno: 8 },
    quorum: ["a.example.test"],
  });
  const authorized = transitionRecoveryEpoch(evidenceEpoch, "authorized", {
    acknowledgements: ["a.example.test"],
  });
  const existing = transitionRecoveryEpoch(authorized, "bootstrapping");
  await expect(
    completeRecoveryEpoch(
      {
        epoch: existing.epoch,
        winner: "b.example.test",
        clusterId: "cluster",
        membership: existing.quorum,
      },
      {
        read: async () => existing,
        persist: jest.fn(),
        now: () => new Date(),
        publishEvent: jest.fn(),
        debug: jest.fn(),
        setCurrent: jest.fn(),
      },
    ),
  ).rejects.toMatchObject({ statusCode: 409 });
});

test("validates completion authority and persists the complete quorum", async () => {
  await expect(completeRecoveryEpoch()).rejects.toThrow();
  const evidenceEpoch = createRecoveryEpoch({
    clusterId: "cluster",
    evidence: [{ node: "a.example.test", uuid: "cluster", seqno: 8 }],
    winner: { node: "a.example.test", uuid: "cluster", seqno: 8 },
    quorum: ["a.example.test"],
  });
  const authorized = transitionRecoveryEpoch(evidenceEpoch, "authorized", {
    acknowledgements: ["a.example.test"],
  });
  const existing = transitionRecoveryEpoch(authorized, "bootstrapping");
  const dependencies = () => ({
    read: async () => existing,
    persist: jest.fn(),
    now: () => new Date("2026-10-14T00:00:00Z"),
    publishEvent: jest.fn(),
    debug: jest.fn(),
    setCurrent: jest.fn(),
  });
  const request = { epoch: existing.epoch, winner: "a.example.test", clusterId: "cluster" };
  await expect(
    completeRecoveryEpoch(
      { ...request, epoch: "stale", membership: existing.quorum },
      dependencies(),
    ),
  ).rejects.toMatchObject({ statusCode: 409 });
  await expect(
    completeRecoveryEpoch(
      { ...request, clusterId: "other", membership: existing.quorum },
      dependencies(),
    ),
  ).rejects.toMatchObject({ statusCode: 409 });
  await expect(
    completeRecoveryEpoch({ ...request, membership: "invalid" }, dependencies()),
  ).rejects.toMatchObject({
    statusCode: 409,
  });
  await expect(
    completeRecoveryEpoch({ ...request, membership: [] }, dependencies()),
  ).rejects.toMatchObject({
    statusCode: 409,
  });
  await expect(
    completeRecoveryEpoch({ ...request, membership: ["other.example.test"] }, dependencies()),
  ).rejects.toMatchObject({ statusCode: 409 });

  const deps = dependencies();
  await expect(
    completeRecoveryEpoch({ ...request, membership: existing.quorum }, deps),
  ).resolves.toMatchObject({ phase: "complete" });
  expect(deps.persist).toHaveBeenCalledWith(expect.any(Object), existing.epoch);
  expect(deps.setCurrent).toHaveBeenCalled();
  expect(deps.publishEvent).toHaveBeenCalledWith(
    expect.objectContaining({ type: "recovery.bootstrap-complete" }),
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

test("does not treat a Primary from another cluster as a join target", async () => {
  const active = {
    ...recoveryEvidence("b.example.test", 2),
    active: true,
    galera: { clusterUuid: "other", clusterStatus: "Primary", localState: "Synced", ready: true },
  };
  const protocol = createColdRecoveryProtocol({
    nodes: [
      { name: "a.example.test", local: true },
      { name: "b.example.test", url: "http://b.example.test" },
    ],
    localEvidence: async () => ({
      ...recoveryEvidence("a.example.test", 1),
      galera: { clusterUuid: "cluster" },
    }),
    fetchEvidence: async () => active,
    store: {
      async read() {},
      async write(value) {
        return value;
      },
    },
  });
  await expect(protocol.plan()).resolves.toMatchObject({ mode: "bootstrap" });
});
