import { expect, jest, test } from "@jest/globals";
import { resolveRecoveryPlan } from "../../../src/runtime/recovery/plan-retry.mjs";

test("returns an immediately available plan", async () => {
  await expect(resolveRecoveryPlan()).rejects.toThrow();
  await expect(
    resolveRecoveryPlan({ recoveryProtocol: { plan: async () => ({ mode: "join" }) } }),
  ).resolves.toEqual({ mode: "join" });
  const protocol = { plan: jest.fn(async () => ({ mode: "bootstrap" })), retry: jest.fn() };
  await expect(
    resolveRecoveryPlan({ recoveryProtocol: protocol, startupTimeoutMs: 1 }),
  ).resolves.toEqual({ mode: "bootstrap" });
  expect(protocol.retry).not.toHaveBeenCalled();
});
test("retries blocked plans within the bounded window", async () => {
  const protocol = {
    plan: jest
      .fn()
      .mockResolvedValueOnce({ mode: "blocked" })
      .mockResolvedValueOnce({ mode: "join" }),
    retry: jest.fn(async () => {}),
  };
  const sleep = jest.fn(async () => {});
  await expect(
    resolveRecoveryPlan({ recoveryProtocol: protocol, startupTimeoutMs: 2000, sleep }),
  ).resolves.toEqual({ mode: "join" });
  expect(protocol.retry).toHaveBeenCalledTimes(1);
  expect(sleep).toHaveBeenCalledWith(1000);
});
test("uses the bounded default wait while recovery remains blocked", async () => {
  const protocol = {
    plan: jest.fn().mockResolvedValue({ mode: "blocked" }),
    retry: jest.fn(async () => {}),
  };
  await expect(
    resolveRecoveryPlan({ recoveryProtocol: protocol, startupTimeoutMs: 1001 }),
  ).resolves.toEqual({ mode: "blocked" });
});
test("does not retry terminal split-brain or conflicting evidence refusals", async () => {
  const protocol = {
    plan: jest.fn(async () => ({
      mode: "blocked",
      code: "SPLIT_BRAIN",
      reason: "state UUIDs do not match",
    })),
    retry: jest.fn(),
  };
  const sleep = jest.fn();
  await expect(
    resolveRecoveryPlan({ recoveryProtocol: protocol, startupTimeoutMs: 15000, sleep }),
  ).resolves.toMatchObject({ code: "SPLIT_BRAIN" });
  expect(protocol.plan).toHaveBeenCalledTimes(1);
  expect(protocol.retry).not.toHaveBeenCalled();
  expect(sleep).not.toHaveBeenCalled();
});

test("waits for full evidence before returning a bootstrap candidate", async () => {
  const evidence = [{ node: "a" }, { node: "b" }, { node: "c" }];
  const protocol = {
    plan: jest
      .fn()
      .mockResolvedValueOnce({ mode: "bootstrap", evidence: evidence.slice(0, 2) })
      .mockResolvedValueOnce({ mode: "bootstrap", evidence }),
    retry: jest.fn(async () => {}),
  };
  await expect(
    resolveRecoveryPlan({
      recoveryProtocol: protocol,
      startupTimeoutMs: 2000,
      requiredMemberCount: 3,
      sleep: jest.fn(async () => {}),
    }),
  ).resolves.toMatchObject({ mode: "bootstrap", evidence });
  expect(protocol.plan).toHaveBeenCalledTimes(2);
});

test("blocks bootstrap when full member evidence stays unavailable", async () => {
  const evidence = [{ node: "a" }, { node: "b" }];
  const protocol = {
    plan: jest.fn(async () => ({ mode: "bootstrap", evidence })),
    retry: jest.fn(async () => {}),
  };
  await expect(
    resolveRecoveryPlan({
      recoveryProtocol: protocol,
      startupTimeoutMs: 2000,
      requiredMemberCount: 3,
      sleep: jest.fn(async () => {}),
    }),
  ).resolves.toMatchObject({
    mode: "blocked",
    code: "INCOMPLETE_RECOVERY_EVIDENCE",
    evidence,
  });
  expect(protocol.plan).toHaveBeenCalledTimes(2);
});
