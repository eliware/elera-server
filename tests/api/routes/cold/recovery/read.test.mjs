import { expect, jest, test } from "@jest/globals";
import { handleColdRecoveryReadRoute } from "../../../../../src/api/routes/cold/recovery/read.mjs";

const response = { json: jest.fn() };
test("handles authorized evidence, status, and plan reads", async () => {
  const protocol = {
    evidence: jest.fn(async () => "e"),
    status: jest.fn(async () => "s"),
    plan: jest.fn(async () => "p"),
  };
  for (const [method, name] of [
    ["GET", "evidence"],
    ["GET", "status"],
    ["POST", "plan"],
  ]) {
    expect(
      await handleColdRecoveryReadRoute({
        method,
        path: `/api/v1/cluster/cold-recovery/${name}`,
        response,
        protocol,
        auth: { scopes: ["recovery:read"] },
      }),
    ).toBe(true);
    expect(protocol[name]).toHaveBeenCalled();
  }
  expect(
    await handleColdRecoveryReadRoute({
      method: "GET",
      path: "/other",
      response,
      protocol,
      auth: { root: true },
    }),
  ).toBe(false);
  expect(
    await handleColdRecoveryReadRoute({
      method: "POST",
      path: "/api/v1/cluster/cold-recovery/evidence",
      response,
      protocol,
      auth: { root: true },
    }),
  ).toBe(false);
  expect(
    await handleColdRecoveryReadRoute({
      method: "GET",
      path: "/api/v1/cluster/cold-recovery/status",
      response,
      protocol,
      auth: {},
    }),
  ).toBe(false);
  expect(await handleColdRecoveryReadRoute()).toBe(false);
});
