import { expect, test, jest } from "@jest/globals";
import { handleClusterBootstrapRoute } from "../../../../src/api/routes/cluster/bootstrap-routes.mjs";

const response = () => ({ json: jest.fn() });
const request = (body) => ({
  async *[Symbol.asyncIterator]() {
    yield JSON.stringify(body);
  },
});

test("requires confirmation and eligible offline state", async () => {
  const base = {
    method: "POST",
    path: "/api/v1/cluster/bootstrap",
    response: response(),
    getStatus: async () => ({ ready: false, values: { wsrep_local_state_comment: "Offline" } }),
    bootstrap: jest.fn(),
    enabled: true,
    nodeId: "node.example.test",
  };
  await expect(
    handleClusterBootstrapRoute({ ...base, request: request({}) }),
  ).rejects.toMatchObject({ statusCode: 409 });
  await expect(
    handleClusterBootstrapRoute({ ...base, request: request({ confirm: true }), enabled: false }),
  ).rejects.toMatchObject({ statusCode: 409 });
  await expect(
    handleClusterBootstrapRoute({
      ...base,
      request: request({ confirm: true }),
      bootstrap: undefined,
    }),
  ).rejects.toMatchObject({ statusCode: 503 });
});

test("starts an eligible bootstrap and returns its node identity", async () => {
  const responseValue = response();
  const bootstrap = jest.fn();
  await expect(
    handleClusterBootstrapRoute({
      method: "POST",
      path: "/api/v1/cluster/bootstrap",
      request: request({ confirm: true }),
      response: responseValue,
      getStatus: async () => ({ ready: false, values: { wsrep_local_state_comment: "Offline" } }),
      bootstrap,
      enabled: true,
      nodeId: "node.example.test",
    }),
  ).resolves.toBe(true);
  expect(bootstrap).toHaveBeenCalledTimes(1);
  expect(responseValue.json).toHaveBeenCalledWith(
    202,
    expect.objectContaining({ data: { identity: "node.example.test" } }),
  );
});

test("does not handle another route", async () => {
  await expect(
    handleClusterBootstrapRoute({ method: "GET", path: "/api/v1/cluster/bootstrap" }),
  ).resolves.toBe(false);
});
