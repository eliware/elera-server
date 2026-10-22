import { expect, jest, test } from "@jest/globals";
import { applyReconcileIdempotently } from "../../../src/api/routes/reconcile-idempotency.mjs";

test("requires and replays an idempotency key for the same apply request", async () => {
  const reconciler = { apply: jest.fn(async () => ({ applied: 1 })) };
  await expect(
    applyReconcileIdempotently(reconciler, "/apply", {}, {}, undefined),
  ).rejects.toMatchObject({
    statusCode: 400,
  });
  await expect(
    applyReconcileIdempotently(reconciler, "/apply", { accounts: [] }, {}, "key"),
  ).resolves.toEqual({ applied: 1 });
  await expect(
    applyReconcileIdempotently(reconciler, "/apply", { accounts: [] }, {}, "key"),
  ).resolves.toEqual({ applied: 1 });
  expect(reconciler.apply).toHaveBeenCalledTimes(1);
});

test("rejects key reuse for different desired state and allows retry after failure", async () => {
  const reconciler = {
    apply: jest
      .fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("failed"))
      .mockResolvedValueOnce({}),
  };
  await applyReconcileIdempotently(reconciler, "/apply", { a: 1 }, {}, "key");
  await expect(
    applyReconcileIdempotently(reconciler, "/apply", { a: 2 }, {}, "key"),
  ).rejects.toMatchObject({
    statusCode: 409,
  });
  await expect(
    applyReconcileIdempotently(reconciler, "/apply", { a: 1 }, {}, "retry"),
  ).rejects.toThrow("failed");
  await expect(
    applyReconcileIdempotently(reconciler, "/apply", { a: 1 }, {}, "retry"),
  ).resolves.toEqual({});
});
