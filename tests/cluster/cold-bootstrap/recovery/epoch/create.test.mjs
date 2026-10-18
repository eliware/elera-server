import { expect, test } from "@jest/globals";
import { createRecoveryEpoch } from "../../../../../src/cluster/cold-bootstrap/recovery/epoch/create.mjs";

const evidence = [{ node: "a.example.test", uuid: "cluster", seqno: 4 }];

test("creates a stable epoch from evidence and a quorum", () => {
  const epoch = createRecoveryEpoch({
    clusterId: "cluster",
    evidence,
    winner: evidence[0],
    quorum: ["b.example.test", "a.example.test", "a.example.test"],
    now: new Date("2026-01-01T00:00:00Z"),
  });
  expect(epoch).toMatchObject({
    version: 1,
    clusterId: "cluster",
    winner: { node: "a.example.test", seqno: 4 },
    quorum: ["a.example.test", "b.example.test"],
    phase: "evidence",
  });
});

test("rejects incomplete epoch input", () => {
  const valid = { clusterId: "cluster", evidence, winner: evidence[0], quorum: ["a"] };
  const invalid = [
    {},
    { ...valid, clusterId: undefined },
    { ...valid, winner: undefined },
    { ...valid, winner: { node: "a", seqno: 1.5 } },
    { ...valid, evidence: undefined },
    { ...valid, quorum: undefined },
    { ...valid, quorum: [] },
  ];
  for (const options of invalid) expect(() => createRecoveryEpoch(options)).toThrow("complete");
});
