import { expect, test } from "@jest/globals";
import { resolveStartupRecoveryOutcome } from "../../../../src/cluster/cold-bootstrap/startup/recovery-outcome.mjs";

const nodes = [{ name: "a.example.test", local: true }, { name: "b.example.test" }];
const result = (node, seqno, extra = {}) => ({
  status: "fulfilled",
  value: { node, state: { node, uuid: "cluster", seqno }, ...extra },
});

test("returns a join decision when a primary peer is active", () => {
  const active = result("b.example.test", 7, {
    active: true,
    galera: { clusterStatus: "Primary", localState: "Synced", ready: "ON" },
  });
  expect(
    resolveStartupRecoveryOutcome({
      nodes,
      results: [result("a.example.test", 6), active, { status: "rejected", reason: new Error() }],
    }),
  ).toMatchObject({ mode: "join", bootstrapComplete: true });
});

test("raises a peer failure when no primary component exists", () => {
  const failure = new Error("peer unavailable");
  expect(() =>
    resolveStartupRecoveryOutcome({
      nodes,
      results: [result("a.example.test", 6), { status: "rejected", reason: failure }],
    }),
  ).toThrow(failure);
});

test("blocks identity mismatches and unrecoverable evidence", () => {
  expect(() =>
    resolveStartupRecoveryOutcome({ nodes, results: [result("wrong.example.test", 6)] }),
  ).toThrow(expect.objectContaining({ code: "RECOVERY_EVIDENCE_IDENTITY_MISMATCH" }));
  expect(() =>
    resolveStartupRecoveryOutcome({
      nodes,
      results: [{ status: "fulfilled", value: { uuid: "cluster", seqno: 6 } }],
    }),
  ).toThrow("received none");
  const negative = [result("a.example.test", -1), result("b.example.test", -1)];
  expect(resolveStartupRecoveryOutcome({ nodes, results: negative })).toMatchObject({
    mode: "blocked",
    reason: "no recoverable seqno exists",
  });
});

test("creates a bootstrap decision and accepts an epoch override", () => {
  const results = [
    { status: "fulfilled", value: { node: "a.example.test", uuid: "cluster", seqno: 2 } },
    {
      status: "fulfilled",
      value: {
        state: {
          node: "b.example.test",
          uuid: "cluster",
          seqno: 7,
          galera: { clusterStatus: "Primary", localState: "Synced", ready: true },
        },
        active: false,
      },
    },
  ];
  expect(resolveStartupRecoveryOutcome({ nodes, results, epoch: () => "override" })).toMatchObject({
    mode: "bootstrap",
    winner: "b.example.test",
    epoch: "override",
  });
  expect(resolveStartupRecoveryOutcome({ nodes, results })).toMatchObject({ mode: "bootstrap" });
});
