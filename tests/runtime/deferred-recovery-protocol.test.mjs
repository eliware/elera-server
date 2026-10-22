import { expect, jest, test } from "@jest/globals";
import { createDeferredRecoveryProtocol } from "../../src/runtime/deferred-recovery-protocol.mjs";

test("waits for the recovery protocol to be registered before dispatching", async () => {
  let protocol;
  const status = jest.fn(async () => ({ phase: "blocked" }));
  const deferred = createDeferredRecoveryProtocol(() => protocol, { timeoutMs: 50, intervalMs: 1 });
  const pending = deferred.status();
  protocol = { status };
  await expect(pending).resolves.toEqual({ phase: "blocked" });
  expect(status).toHaveBeenCalled();
});
test("reports structured unavailability after the initialization deadline", async () => {
  await expect(
    createDeferredRecoveryProtocol(() => undefined, { timeoutMs: 1, intervalMs: 1 }).plan(),
  ).rejects.toMatchObject({ code: "RECOVERY_UNAVAILABLE", statusCode: 503 });
});

test("uses default timeout and interval values when options are omitted", async () => {
  jest.useFakeTimers();
  const pending = createDeferredRecoveryProtocol(undefined).plan();
  jest.advanceTimersByTime(5001);
  await expect(pending).rejects.toMatchObject({ code: "RECOVERY_UNAVAILABLE" });
  jest.useRealTimers();
});
