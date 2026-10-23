import { expect, jest, test } from "@jest/globals";
import { releaseRecoveryLease } from "../../../src/runtime/maria/release-recovery-lease.mjs";

test("releases a recovery lease when the cluster reaches readiness", async () => {
  const lease = { release: jest.fn(async () => true) };
  await expect(releaseRecoveryLease(lease)).resolves.toBeUndefined();
  expect(lease.release).toHaveBeenCalledTimes(1);
});

test("reports lease cleanup errors without failing readiness", async () => {
  const log = { warn: jest.fn() };
  const error = new Error("storage unavailable");
  await expect(
    releaseRecoveryLease(
      {
        release: async () => {
          throw error;
        },
      },
      log,
    ),
  ).resolves.toBeUndefined();
  expect(log.warn).toHaveBeenCalledWith("Recovery lease cleanup failed", { error });
});

test("does nothing when a lease cannot release", async () => {
  await expect(releaseRecoveryLease()).resolves.toBeUndefined();
});
