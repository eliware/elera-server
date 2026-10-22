import { expect, jest, test } from "@jest/globals";
import { handleColdRecoveryRoute } from "../../../../src/api/routes/cold/recovery.mjs";
const request = (body = {}) => ({
  async *[Symbol.asyncIterator]() {
    yield JSON.stringify(body);
  },
});
const response = () => ({ json: jest.fn() });

test("rejects an omitted recovery route context", async () => {
  await expect(handleColdRecoveryRoute()).resolves.toBe(false);
});

test("rejects unauthorized recovery routes", async () => {
  const protocol = {
    evidence: jest.fn(),
    status: jest.fn(),
    plan: jest.fn(),
    retry: jest.fn(),
    authorize: jest.fn(),
    beginBootstrap: jest.fn(),
    complete: jest.fn(),
  };
  await expect(
    handleColdRecoveryRoute({
      method: "GET",
      path: "/api/v1/cluster/cold-recovery/evidence",
      response: response(),
      protocol,
      auth: {},
    }),
  ).resolves.toBe(false);
  await expect(
    handleColdRecoveryRoute({
      method: "GET",
      path: "/api/v1/cluster/cold-recovery/status",
      response: response(),
      protocol,
      auth: {},
    }),
  ).resolves.toBe(false);
  await expect(
    handleColdRecoveryRoute({
      method: "POST",
      path: "/api/v1/cluster/cold-recovery/plan",
      response: response(),
      protocol,
      auth: {},
    }),
  ).resolves.toBe(false);
  await expect(
    handleColdRecoveryRoute({
      method: "POST",
      path: "/api/v1/cluster/cold-recovery/retry",
      response: response(),
      protocol,
      auth: {},
    }),
  ).resolves.toBe(false);
  await expect(
    handleColdRecoveryRoute({
      method: "POST",
      path: "/api/v1/cluster/cold-recovery/authorize",
      response: response(),
      protocol,
      auth: {},
    }),
  ).resolves.toBe(false);
  await expect(
    handleColdRecoveryRoute({
      method: "POST",
      path: "/api/v1/cluster/cold-recovery/bootstrap",
      response: response(),
      protocol,
      auth: {},
    }),
  ).resolves.toBe(false);
  await expect(
    handleColdRecoveryRoute({
      method: "POST",
      path: "/api/v1/cluster/cold-recovery/complete",
      response: response(),
      protocol,
      auth: {},
    }),
  ).resolves.toBe(false);
});

test("covers every authenticated recovery operation and protocol absence", async () => {
  const protocol = {
    evidence: jest.fn(async () => []),
    status: jest.fn(async () => ({})),
    plan: jest.fn(async () => ({})),
    retry: jest.fn(async () => ({})),
    authorize: jest.fn(async () => ({})),
    beginBootstrap: jest.fn(async () => ({})),
    complete: jest.fn(async () => ({})),
  };
  const auth = { root: true, identity: "peer.example.test" };
  for (const [method, path] of [
    ["GET", "/api/v1/cluster/cold-recovery/evidence"],
    ["GET", "/api/v1/cluster/cold-recovery/status"],
    ["POST", "/api/v1/cluster/cold-recovery/plan"],
    ["POST", "/api/v1/cluster/cold-recovery/retry"],
    ["POST", "/api/v1/cluster/cold-recovery/bootstrap"],
    ["POST", "/api/v1/cluster/cold-recovery/complete"],
  ])
    await expect(
      handleColdRecoveryRoute({
        method,
        path,
        request: request({ epoch: "e", confirm: true }),
        response: response(),
        protocol,
        auth,
        internal: path.endsWith("/authorize"),
      }),
    ).resolves.toBe(true);
  await expect(
    handleColdRecoveryRoute({
      method: "POST",
      path: "/api/v1/cluster/cold-recovery/authorize",
      request: request({ epoch: "e", confirm: true }),
      response: response(),
      protocol,
      auth,
      internal: true,
    }),
  ).rejects.toMatchObject({ statusCode: 403 });
  const unavailable = response();
  await expect(
    handleColdRecoveryRoute({
      method: "GET",
      path: "/api/v1/cluster/cold-recovery/status",
      response: unavailable,
      protocol: undefined,
      auth,
    }),
  ).resolves.toBe(true);
  expect(unavailable.json).toHaveBeenCalledWith(
    503,
    expect.objectContaining({ code: "RECOVERY_UNAVAILABLE" }),
  );
  const initializingPlan = response();
  await expect(
    handleColdRecoveryRoute({
      method: "POST",
      path: "/api/v1/cluster/cold-recovery/plan",
      response: initializingPlan,
      protocol: undefined,
      auth,
    }),
  ).resolves.toBe(true);
  expect(initializingPlan.json).toHaveBeenCalledWith(
    200,
    expect.objectContaining({
      data: expect.objectContaining({ eligible: false, mode: "blocked" }),
    }),
  );
  await expect(
    handleColdRecoveryRoute({
      method: "POST",
      path: "/api/v1/cluster/cold-recovery/plan",
      response: response(),
      protocol: undefined,
      auth: {},
    }),
  ).resolves.toBe(false);
  await expect(
    handleColdRecoveryRoute({
      method: "GET",
      path: "/api/v1/cluster/cold-recovery/status",
      response: response(),
      protocol: undefined,
      auth: {},
    }),
  ).resolves.toBe(false);
});
