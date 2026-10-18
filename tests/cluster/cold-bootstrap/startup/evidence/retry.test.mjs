import { expect, jest, test } from "@jest/globals";
import { retryStartupEvidence } from "../../../../../src/cluster/cold-bootstrap/startup/evidence/retry.mjs";

test("retries a transient failure then returns the resolved evidence", async () => {
  const collect = jest
    .fn()
    .mockRejectedValueOnce(new Error("peer offline"))
    .mockResolvedValue("evidence");
  const resolve = jest.fn((value) => value);
  await expect(retryStartupEvidence({ attempts: 2, delayMs: 0, collect, resolve })).resolves.toBe(
    "evidence",
  );
  expect(collect).toHaveBeenCalledTimes(2);
});

test("blocks immediately after an evidence identity mismatch", async () => {
  const mismatch = Object.assign(new Error("wrong peer"), {
    code: "RECOVERY_EVIDENCE_IDENTITY_MISMATCH",
  });
  await expect(
    retryStartupEvidence({
      attempts: 3,
      delayMs: 0,
      collect: async () => {
        throw mismatch;
      },
      resolve: async () => {},
    }),
  ).resolves.toMatchObject({ mode: "blocked", code: mismatch.code, reason: mismatch.message });
});

test("reports a timeout when retries fail without an error message", async () => {
  await expect(
    retryStartupEvidence({
      attempts: 1,
      delayMs: 0,
      collect: async () => {
        throw {};
      },
      resolve: async () => {},
    }),
  ).resolves.toMatchObject({ mode: "blocked", reason: "recovery data unavailable: timeout" });
});
