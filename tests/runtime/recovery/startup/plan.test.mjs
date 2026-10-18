import { expect, jest, test } from "@jest/globals";

let decision = { mode: "blocked", reason: "uncertain" };
let dataAction = "start";
const close = jest.fn();
jest.unstable_mockModule("../../../../src/runtime/recovery/startup/decision.mjs", () => ({
  recoveryStartupDecision: jest.fn(() => decision),
}));
jest.unstable_mockModule("../../../../src/runtime/recovery/decision.mjs", () => ({
  recordSupervisorRecoveryDecision: jest.fn(),
}));
jest.unstable_mockModule("../../../../src/runtime/recovery/authorization.mjs", () => ({
  authorizeSupervisorRecovery: jest.fn(async ({ decision: value }) => ({
    decision: value,
    args: ["safe"],
  })),
}));
jest.unstable_mockModule("../../../../src/runtime/rejoin-decision.mjs", () => ({
  resolveSupervisorRejoin: jest.fn(async (value) => value.decision),
}));
jest.unstable_mockModule("../../../../src/runtime/recovery/plan-retry.mjs", () => ({
  resolveRecoveryPlan: jest.fn(async () => ({ mode: "blocked" })),
}));
jest.unstable_mockModule("../../../../src/lifecycle/data/directory.mjs", () => ({
  inspectDataDirectory: jest.fn(() => ({ action: dataAction })),
}));
const { resolveSupervisorStartupPlan } =
  await import("../../../../src/runtime/recovery/startup/plan.mjs");

const base = {
  recoveryProtocol: {},
  startupTimeoutMs: 100,
  identity: { name: "node.example.test" },
  recoveryState: {},
  recoveryAudit: {},
  environment: {},
  members: [],
  config: { dataDir: "/data" },
  intentState: {},
  log: { debug: jest.fn() },
  startupServer: { close },
};

test("allows normal rejoin when blocked recovery has initialized data", async () => {
  decision = { mode: "blocked", reason: "uncertain" };
  dataAction = "start";
  const result = await resolveSupervisorStartupPlan({ ...base, unifiedListener: true });
  expect(result.decision).toMatchObject({ mode: "rejoin", bootstrapComplete: true });
  expect(result.args).toEqual(["safe"]);
  expect(close).not.toHaveBeenCalled();
});

test("keeps the listener for a local bootstrap winner", async () => {
  decision = { mode: "bootstrap", localWinner: true };
  await resolveSupervisorStartupPlan({ ...base, unifiedListener: false });
  expect(close).not.toHaveBeenCalled();
});

test("closes a separate evidence server for other decisions", async () => {
  decision = { mode: "blocked", reason: "uncertain" };
  dataAction = "preserve";
  await resolveSupervisorStartupPlan({ ...base, unifiedListener: false });
  expect(close).toHaveBeenCalled();
});
