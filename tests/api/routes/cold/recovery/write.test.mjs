import { expect, jest, test } from "@jest/globals";
import { handleColdRecoveryWriteRoute } from "../../../../../src/api/routes/cold/recovery/write.mjs";
const request = (body) => ({
  async *[Symbol.asyncIterator]() {
    yield JSON.stringify(body);
  },
});
const paths = ["retry", "authorize", "bootstrap", "complete"];

test("authorizes recovery writes and returns each operation result", async () => {
  const response = { json: jest.fn() };
  const protocol = {
    retry: jest.fn(async () => "r"),
    authorize: jest.fn(async (v) => v),
    beginBootstrap: jest.fn(async (v) => v),
    complete: jest.fn(async (v) => v),
  };
  for (const name of paths) {
    const path = `/api/v1/cluster/cold-recovery/${name}`;
    expect(
      await handleColdRecoveryWriteRoute({
        method: "POST",
        path,
        response,
        protocol,
        auth: { root: true },
        request: request({ force: true }),
      }),
    ).toBe(true);
  }
  expect(
    await handleColdRecoveryWriteRoute({
      method: "GET",
      path: "/api/v1/cluster/cold-recovery/retry",
      response,
      protocol,
      auth: { root: true },
    }),
  ).toBe(false);
  expect(
    await handleColdRecoveryWriteRoute({
      method: "POST",
      path: "/api/v1/cluster/cold-recovery/retry",
      response,
      protocol,
      auth: {},
    }),
  ).toBe(false);
  expect(
    await handleColdRecoveryWriteRoute({
      method: "POST",
      path: "/other",
      response,
      protocol,
      internal: true,
    }),
  ).toBe(false);
  expect(protocol.retry).toHaveBeenCalledTimes(1);
  expect(protocol.authorize).toHaveBeenCalledWith({ force: true });
  expect(await handleColdRecoveryWriteRoute()).toBe(false);
});

test("requires root access for forced recovery authorization", async () => {
  await expect(
    handleColdRecoveryWriteRoute({
      method: "POST",
      path: "/api/v1/cluster/cold-recovery/authorize",
      request: request({ force: true }),
      response: { json: jest.fn() },
      protocol: { authorize: jest.fn() },
      auth: { scopes: ["recovery:write"] },
    }),
  ).rejects.toMatchObject({ statusCode: 403 });
});
