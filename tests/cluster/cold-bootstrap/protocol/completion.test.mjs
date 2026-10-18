import { expect, jest, test } from "@jest/globals";
import { createRecoveryEpoch } from "../../../../src/cluster/cold-bootstrap/recovery/epoch/create.mjs";
import { completeRecoveryEpoch } from "../../../../src/cluster/cold-bootstrap/protocol/completion.mjs";

jest.useFakeTimers();
test("rejects completion from a different winner", async () => {
  const existing = createRecoveryEpoch({
    clusterId: "cluster",
    evidence: [{ node: "a.example.test", uuid: "cluster", seqno: 8 }],
    winner: { node: "a.example.test", uuid: "cluster", seqno: 8 },
    quorum: ["a.example.test"],
  });
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
