import { expect, jest, test } from "@jest/globals";
import { handlePendingColdRecoveryRoute } from "../../../../../src/api/routes/cold/recovery/pending.mjs";

test("reports pending recovery plans and unavailable recovery actions", () => {
  const response = { json: jest.fn() };
  expect(
    handlePendingColdRecoveryRoute({
      method: "POST",
      path: "/api/v1/cluster/cold-recovery/plan",
      response,
      authorized: true,
    }),
  ).toBe(true);
  expect(response.json).toHaveBeenCalledWith(
    200,
    expect.objectContaining({
      data: expect.objectContaining({
        mode: "blocked",
        reason: "recovery protocol is still initializing",
      }),
    }),
  );
  expect(
    handlePendingColdRecoveryRoute({
      method: "GET",
      path: "/api/v1/cluster/cold-recovery/status",
      response,
      authorized: true,
    }),
  ).toBe(true);
  expect(response.json).toHaveBeenLastCalledWith(
    503,
    expect.objectContaining({ code: "RECOVERY_UNAVAILABLE" }),
  );
});

test("does not handle unauthorized or unrelated requests", () => {
  const response = { json: jest.fn() };
  expect(
    handlePendingColdRecoveryRoute({
      method: "POST",
      path: "/api/v1/cluster/cold-recovery/plan",
      response,
      authorized: false,
    }),
  ).toBe(false);
  expect(
    handlePendingColdRecoveryRoute({
      method: "GET",
      path: "/api/v1/status",
      response,
      authorized: true,
    }),
  ).toBe(false);
  expect(response.json).not.toHaveBeenCalled();
});
