import { expect, jest, test } from "@jest/globals";
import { handleColdRecoveryWriteRoute } from "../../../../../src/api/routes/cold/recovery/write.mjs";
const request = (body) => ({
  async *[Symbol.asyncIterator]() {
    yield JSON.stringify(body);
  },
});
const paths = ["retry", "authorize", "bootstrap", "complete"];

test("authorizes recovery writes except peer-quorum authorization", async () => {
  const response = { json: jest.fn() };
  const protocol = {
    retry: jest.fn(async () => "r"),
    authorize: jest.fn(async (v) => v),
    beginBootstrap: jest.fn(async (v) => v),
    complete: jest.fn(async (v) => v),
  };
  for (const name of paths.filter((name) => name !== "authorize")) {
    const path = `/api/v1/cluster/cold-recovery/${name}`;
    expect(
      await handleColdRecoveryWriteRoute({
        method: "POST",
        path,
        response,
        protocol,
        auth: { root: true, identity: "peer.example.test" },
        internal: true,
        request: request({ force: true, confirm: true, acknowledgements: ["fake", "names"] }),
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
  await expect(
    handleColdRecoveryWriteRoute({
      method: "POST",
      path: "/api/v1/cluster/cold-recovery/authorize",
      response,
      protocol,
      auth: { root: true, identity: "peer.example.test" },
      internal: true,
      request: request({ confirm: true, force: true }),
    }),
  ).rejects.toMatchObject({ statusCode: 403 });
  expect(protocol.authorize).not.toHaveBeenCalled();
  expect(await handleColdRecoveryWriteRoute()).toBe(false);
});

test("requires confirmation for recovery mutations", async () => {
  await expect(
    handleColdRecoveryWriteRoute({
      method: "POST",
      path: "/api/v1/cluster/cold-recovery/bootstrap",
      request: request({ epoch: "e" }),
      response: { json: jest.fn() },
      protocol: { beginBootstrap: jest.fn() },
      auth: { scopes: ["recovery:write"] },
    }),
  ).rejects.toMatchObject({ statusCode: 409 });
});

test("does not accept caller-supplied recovery acknowledgements from a root request", async () => {
  await expect(
    handleColdRecoveryWriteRoute({
      method: "POST",
      path: "/api/v1/cluster/cold-recovery/authorize",
      request: request({ acknowledgements: ["a", "b", "c"], confirm: true }),
      response: { json: jest.fn() },
      protocol: { authorize: jest.fn() },
      auth: { root: true },
    }),
  ).rejects.toMatchObject({ statusCode: 403 });
});
