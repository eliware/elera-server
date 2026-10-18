import { expect, test } from "@jest/globals";
import { validateRecoveryEpoch } from "../../../../../src/cluster/cold-bootstrap/recovery/epoch/validation.mjs";

const valid = {
  version: 1,
  clusterId: "cluster",
  evidenceDigest: "digest",
  winner: { node: "a.example.test" },
  quorum: ["a.example.test"],
  phase: "evidence",
  epoch: "cluster:digest",
};

test("accepts a matching evidence epoch", () => {
  expect(validateRecoveryEpoch(valid, "cluster")).toBe(true);
});

test("rejects epochs with invalid identity or evidence", () => {
  const invalid = [
    undefined,
    { ...valid, version: 2 },
    { ...valid, clusterId: "other" },
    { ...valid, evidenceDigest: "" },
    { ...valid, winner: undefined },
    { ...valid, quorum: undefined },
    { ...valid, phase: "blocked" },
    { ...valid, epoch: "other:digest" },
  ];
  for (const epoch of invalid) expect(validateRecoveryEpoch(epoch, "cluster")).toBe(false);
});
