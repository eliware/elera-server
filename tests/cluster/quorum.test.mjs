import { expect, jest, test } from "@jest/globals";
import { evaluateQuorum } from "../../src/cluster/quorum.mjs";
import { createObservationStore } from "../../src/cluster/observation-store.mjs";
import { createQuorumAssignmentCoordinator } from "../../src/routing/quorum-assignment.mjs";
import { selectCandidate } from "../../src/cluster/cold-bootstrap/candidate.mjs";

const observation = (nodeId, overrides = {}) => ({
  nodeId: `${nodeId}.example.test`,
  clusterId: "cluster",
  state: "Synced",
  synced: true,
  primary: "Primary",
  health: "ready",
  observedAt: 1000,
  ...overrides,
});
test("establishes quorum for fresh consistent observations", () => {
  expect(
    evaluateQuorum([observation("a"), observation("b"), observation("c")], { now: 1000 }),
  ).toMatchObject({
    quorum: true,
    required: 2,
    reason: "quorum-established",
    clusterId: "cluster",
    primary: "Primary",
  });
});
test("rejects stale, conflicting, and insufficient observations", () => {
  expect(
    evaluateQuorum([observation("a"), observation("b", { observedAt: 0 })], {
      now: 1000,
      maxAgeMs: 10,
      expectedSize: 3,
    }).reason,
  ).toBe("insufficient-fresh-observations");
  expect(
    evaluateQuorum([observation("a"), observation("b", { clusterId: "other" })], { now: 1000 })
      .reason,
  ).toBe("conflicting-clusters");
  expect(
    evaluateQuorum([observation("a"), observation("b", { primary: "Non-Primary" })], { now: 1000 })
      .reason,
  ).toBe("conflicting-primaries");
});
test("handles empty observations and explicit quorum sizing", () => {
  expect(evaluateQuorum([], { expectedSize: 0 })).toMatchObject({
    quorum: false,
    required: 1,
    reason: "insufficient-fresh-observations",
    clusterId: null,
    primary: null,
  });
  expect(evaluateQuorum([observation("a")], { now: 1000, expectedSize: 1 })).toMatchObject({
    quorum: true,
    required: 1,
  });
});
test("does not count duplicate identities or invalid observations toward quorum", () => {
  expect(
    evaluateQuorum([observation("a"), observation("a"), observation("b")], {
      now: 1000,
      expectedSize: 5,
    }).reason,
  ).toBe("insufficient-fresh-observations");
  expect(
    evaluateQuorum([observation("a"), { nodeId: "short", observedAt: 1000 }], {
      now: 1000,
      expectedSize: 3,
    }).reason,
  ).toBe("invalid-observations");
  expect(evaluateQuorum(null, { expectedSize: 3 }).reason).toBe("insufficient-fresh-observations");
});

test("rejects a split-brain view with conflicting primary identities", () => {
  const observations = [
    observation("elera-0.cluster.local"),
    observation("elera-1.cluster.local"),
    observation("elera-2.cluster.local", { primary: "other-primary" }),
  ];
  expect(evaluateQuorum(observations, { expectedSize: 3, now: 100 }).quorum).toBe(false);
  expect(evaluateQuorum(observations, { expectedSize: 3, now: 100 }).reason).toBe(
    "conflicting-primaries",
  );
});

test("last surviving member cannot claim a writer after total cluster loss", async () => {
  const observations = [
    observation("elera-0.cluster.local", { observedAt: 100 }),
    observation("elera-1.cluster.local", { observedAt: 0 }),
    observation("elera-2.cluster.local", { observedAt: 0 }),
  ];
  const store = createObservationStore({ now: () => 100 });
  store.upsert(observations[0]);
  const coordinator = createQuorumAssignmentCoordinator({
    assignmentStore: {
      get: async () => "elera-0.cluster.local.elera",
      set: jest.fn(),
    },
    observationStore: store,
    environment: { ELERA_CLUSTER_SIZE: "3" },
    now: () => 100,
  });
  await expect(coordinator.write("payments", "elera-0.cluster.local.elera")).rejects.toMatchObject({
    code: "QUORUM_REQUIRED",
  });
  expect(
    selectCandidate([
      { node: "elera-0.example.test", uuid: "cluster", seqno: 9 },
      { node: "elera-1.example.test", uuid: "cluster", seqno: 8 },
      { node: "elera-2.example.test", uuid: "cluster", seqno: 7 },
    ]),
  ).toMatchObject({ eligible: true, candidate: { node: "elera-0.example.test" } });
});
