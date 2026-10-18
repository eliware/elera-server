import { expect, test } from "@jest/globals";
import { transitionRecoveryEpoch } from "../../../../src/cluster/cold-bootstrap/recovery/epoch.mjs";
import { createRecoveryEpoch } from "../../../../src/cluster/cold-bootstrap/recovery/epoch/create.mjs";
import { validateRecoveryEpoch } from "../../../../src/cluster/cold-bootstrap/recovery/epoch/validation.mjs";
const evidence = [
  { node: "a.example.test", uuid: "u", seqno: 4 },
  { node: "b.example.test", uuid: "u", seqno: 3 },
  { node: "c.example.test", uuid: "u", seqno: 2 },
];
test("creates and validates a deterministic recovery epoch", () => {
  const epoch = createRecoveryEpoch({
    clusterId: "u",
    evidence,
    winner: evidence[0],
    quorum: ["a.example.test", "b.example.test", "c.example.test"],
  });
  expect(validateRecoveryEpoch(epoch, "u")).toBe(true);
  expect(epoch.winner.node).toBe("a.example.test");
});
test("requires full-cluster authorization and matching completion identity", () => {
  const epoch = createRecoveryEpoch({
    clusterId: "u",
    evidence,
    winner: evidence[0],
    quorum: ["a.example.test", "b.example.test", "c.example.test"],
  });
  expect(() => transitionRecoveryEpoch(epoch, "authorized", { acknowledgements: 1 })).toThrow(
    "identified",
  );
  expect(() =>
    transitionRecoveryEpoch(epoch, "authorized", {
      acknowledgements: ["a.example.test", "b.example.test"],
    }),
  ).toThrow("full-cluster");
  const authorized = transitionRecoveryEpoch(epoch, "authorized", {
    acknowledgements: ["a.example.test", "b.example.test", "c.example.test"],
  });
  expect(authorized.acknowledgements).toEqual(
    new Set(["a.example.test", "b.example.test", "c.example.test"]),
  );
  const bootstrapping = transitionRecoveryEpoch(authorized, "bootstrapping");
  expect(
    transitionRecoveryEpoch(bootstrapping, "complete", { clusterId: "u", winner: "a.example.test" })
      .phase,
  ).toBe("complete");
  expect(() =>
    transitionRecoveryEpoch(bootstrapping, "complete", {
      clusterId: "other",
      winner: "a.example.test",
    }),
  ).toThrow("identity");
});
test("requires bootstrap phase before completion and only accepts quorum members", () => {
  const epoch = createRecoveryEpoch({
    clusterId: "u",
    evidence,
    winner: evidence[0],
    quorum: ["a.example.test", "b.example.test", "c.example.test"],
  });
  expect(() =>
    transitionRecoveryEpoch(epoch, "complete", { clusterId: "u", winner: "a.example.test" }),
  ).toThrow("epoch change");
  expect(() =>
    transitionRecoveryEpoch(epoch, "authorized", {
      acknowledgements: ["a.example.test", "b.example.test", "x"],
    }),
  ).toThrow("unknown quorum");
});
test("requires identified, distinct full-cluster acknowledgements", () => {
  const epoch = createRecoveryEpoch({
    clusterId: "u",
    evidence,
    winner: evidence[0],
    quorum: ["a.example.test", "b.example.test", "c.example.test"],
  });
  expect(() => transitionRecoveryEpoch(epoch, "authorized", { acknowledgements: 2 })).toThrow(
    "identified",
  );
  expect(() =>
    transitionRecoveryEpoch(epoch, "authorized", {
      acknowledgements: ["a.example.test", "a.example.test", "b.example.test", "c.example.test"],
    }),
  ).toThrow("duplicate");
});
test("supports an explicitly reduced supervisor quorum for forced recovery", () => {
  const epoch = createRecoveryEpoch({
    clusterId: "u",
    evidence,
    winner: evidence[0],
    quorum: ["a.example.test", "b.example.test", "c.example.test"],
  });
  const authorized = transitionRecoveryEpoch(epoch, "authorized", {
    acknowledgements: ["a.example.test", "b.example.test"],
    requiredAcknowledgements: 2,
    operatorForced: true,
  });
  expect(authorized.requiredAcknowledgements).toBe(2);
  expect(authorized.acknowledgements).toEqual(new Set(["a.example.test", "b.example.test"]));
});
test("validates reduced quorum bounds and acknowledgements", () => {
  const epoch = createRecoveryEpoch({
    clusterId: "u",
    evidence,
    winner: evidence[0],
    quorum: ["a.example.test", "b.example.test", "c.example.test"],
  });
  expect(() =>
    transitionRecoveryEpoch(epoch, "authorized", {
      acknowledgements: ["a"],
      requiredAcknowledgements: 0,
    }),
  ).toThrow("valid supervisor quorum");
  expect(() =>
    transitionRecoveryEpoch(epoch, "authorized", {
      acknowledgements: ["a"],
      requiredAcknowledgements: 2,
    }),
  ).toThrow("required supervisor quorum");
});
test("rejects a completion with the wrong winner", () => {
  const epoch = createRecoveryEpoch({
    clusterId: "u",
    evidence,
    winner: evidence[0],
    quorum: ["a.example.test", "b.example.test", "c.example.test"],
  });
  const bootstrapping = transitionRecoveryEpoch(
    transitionRecoveryEpoch(epoch, "authorized", {
      acknowledgements: ["a.example.test", "b.example.test", "c.example.test"],
    }),
    "bootstrapping",
  );
  expect(() =>
    transitionRecoveryEpoch(bootstrapping, "complete", {
      clusterId: "u",
      winner: "b.example.test",
    }),
  ).toThrow("winner mismatch");
});
test("does not treat refreshed evidence generation as a recovery data change", () => {
  const first = createRecoveryEpoch({
    clusterId: "u",
    evidence,
    winner: evidence[0],
    quorum: ["a.example.test", "b.example.test", "c.example.test"],
  });
  const refreshed = createRecoveryEpoch({
    clusterId: "u",
    evidence: evidence.map((item) => ({ ...item, generation: item.generation + 1 })),
    winner: evidence[0],
    quorum: ["a.example.test", "b.example.test", "c.example.test"],
  });
  expect(refreshed.evidenceDigest).toBe(first.evidenceDigest);
});
test("rejects malformed epochs and invalid transition arguments", () => {
  expect(() => createRecoveryEpoch()).toThrow("complete recovery");
  expect(() => transitionRecoveryEpoch(null, "complete")).toThrow("valid recovery");
  expect(() => transitionRecoveryEpoch(evidence[0], "unknown")).toThrow("valid recovery");
  expect(validateRecoveryEpoch(undefined, "u")).toBe(false);
  expect(
    validateRecoveryEpoch(
      {
        version: 1,
        clusterId: "u",
        evidenceDigest: "d",
        winner: { node: "a.example.test" },
        quorum: ["a"],
        phase: "blocked",
        epoch: "u:d",
      },
      "u",
    ),
  ).toBe(false);
});
