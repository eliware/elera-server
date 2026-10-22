import { expect, test, jest } from "@jest/globals";
import { handleClusterStatusRoute } from "../../../../src/api/routes/cluster/status-routes.mjs";

const response = () => ({ json: jest.fn() });

test("serves status, eligibility, and bootstrap plan", async () => {
  const getStatus = jest.fn(async () => ({
    ready: false,
    values: { wsrep_local_state_comment: "Offline" },
  }));
  for (const [method, path] of [
    ["GET", "/api/v1/cluster/status"],
    ["GET", "/api/v1/cluster/bootstrap/eligibility"],
    ["POST", "/api/v1/cluster/bootstrap/plan"],
  ]) {
    expect(
      await handleClusterStatusRoute({
        method,
        path,
        response: response(),
        getStatus,
        enabled: true,
      }),
    ).toBe(true);
  }
  expect(getStatus).toHaveBeenCalledTimes(3);
});

test("waits until the node is ready or the timeout expires", async () => {
  const readyResponse = response();
  await expect(
    handleClusterStatusRoute({
      method: "GET",
      path: "/api/v1/cluster/wait-ready",
      url: new URL("http://node/api/v1/cluster/wait-ready?timeoutMs=0"),
      response: readyResponse,
      getStatus: async () => ({ ready: true }),
      enabled: true,
    }),
  ).resolves.toBe(true);
  expect(readyResponse.json).toHaveBeenCalledWith(
    200,
    expect.objectContaining({ status: "ready" }),
  );

  const timeoutResponse = response();
  await expect(
    handleClusterStatusRoute({
      method: "GET",
      path: "/api/v1/cluster/wait-ready",
      url: new URL("http://node/api/v1/cluster/wait-ready?timeoutMs=0"),
      response: timeoutResponse,
      getStatus: async () => {
        throw new Error("offline");
      },
      enabled: true,
    }),
  ).resolves.toBe(true);
  expect(timeoutResponse.json).toHaveBeenCalledWith(
    408,
    expect.objectContaining({ status: "timeout", data: { ready: false } }),
  );
});

test("uses the default readiness timeout when the query omits it", async () => {
  const responseValue = response();
  await expect(
    handleClusterStatusRoute({
      method: "GET",
      path: "/api/v1/cluster/wait-ready",
      url: new URL("http://node/api/v1/cluster/wait-ready"),
      response: responseValue,
      getStatus: async () => ({ ready: true }),
      enabled: true,
    }),
  ).resolves.toBe(true);
  expect(responseValue.json).toHaveBeenCalledWith(
    200,
    expect.objectContaining({ status: "ready" }),
  );
});

test("leaves unrelated requests for the dispatcher", async () => {
  await expect(
    handleClusterStatusRoute({ method: "POST", path: "/api/v1/cluster/status" }),
  ).resolves.toBe(false);
});

test.each(["-1", "1.5", "NaN"])("rejects invalid readiness timeout %s", async (timeoutMs) => {
  await expect(
    handleClusterStatusRoute({
      method: "GET",
      path: "/api/v1/cluster/wait-ready",
      url: new URL(`http://node/api/v1/cluster/wait-ready?timeoutMs=${timeoutMs}`),
      response: response(),
      getStatus: async () => ({ ready: true }),
      enabled: true,
    }),
  ).rejects.toMatchObject({ statusCode: 400 });
});

test("polls until a valid timeout expires", async () => {
  jest.useFakeTimers();
  const target = response();
  const pending = handleClusterStatusRoute({
    method: "GET",
    path: "/api/v1/cluster/wait-ready",
    url: new URL("http://node/api/v1/cluster/wait-ready?timeoutMs=5"),
    response: target,
    getStatus: async () => ({ ready: false }),
    enabled: true,
  });
  await jest.advanceTimersByTimeAsync(5);
  await expect(pending).resolves.toBe(true);
  expect(target.json).toHaveBeenCalledWith(408, expect.objectContaining({ status: "timeout" }));
  jest.useRealTimers();
});
