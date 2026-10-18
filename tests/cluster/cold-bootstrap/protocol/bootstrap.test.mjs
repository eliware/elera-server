import { expect, jest, test } from "@jest/globals";
import { createRecoveryEpoch } from "../../../../src/cluster/cold-bootstrap/recovery/epoch/create.mjs";
import { beginRecoveryBootstrap } from "../../../../src/cluster/cold-bootstrap/protocol/bootstrap.mjs";

jest.useFakeTimers();
test("rejects bootstrap before epoch authorization", async () => {
  const existing = createRecoveryEpoch({
    clusterId: "cluster",
    evidence: [{ node: "a.example.test", uuid: "cluster", seqno: 8 }],
    winner: { node: "a.example.test", uuid: "cluster", seqno: 8 },
    quorum: ["a.example.test"],
  });
  await expect(
    beginRecoveryBootstrap(
      { epoch: existing.epoch, winner: existing.winner.node },
      {
        read: async () => existing,
        persist: jest.fn(),
        collect: jest.fn(),
        now: () => new Date(),
        publishEvent: jest.fn(),
        debug: jest.fn(),
        setCurrent: jest.fn(),
      },
    ),
  ).rejects.toMatchObject({ statusCode: 409 });
});
