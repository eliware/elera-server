import { expect, test, jest } from "@jest/globals";
import { handleClusterLifecycleRoute } from "../../../src/api/routes/cluster-lifecycle-routes.mjs";

const response = () => ({ json: jest.fn() });
const request = (body) => ({
  async *[Symbol.asyncIterator]() {
    yield JSON.stringify(body);
  },
});

test("plans and applies lifecycle actions", async () => {
  const planned = response();
  await expect(
    handleClusterLifecycleRoute({
      method: "POST",
      path: "/api/v1/cluster/lifecycle/plan",
      request: request({ action: "join", target: "peer.example.test", quorum: true }),
      response: planned,
      getStatus: async () => ({ ready: false }),
      enabled: true,
      nodeId: "node.example.test",
    }),
  ).resolves.toBe(true);
  expect(planned.json).toHaveBeenCalledWith(200, expect.objectContaining({ status: "planned" }));
  const lifecycle = { execute: jest.fn(async () => ({ status: "completed" })) };
  const applied = response();
  await expect(
    handleClusterLifecycleRoute({
      method: "POST",
      path: "/api/v1/cluster/lifecycle/apply",
      request: request({ action: "drain" }),
      response: applied,
      lifecycle,
      enabled: true,
      nodeId: "node.example.test",
    }),
  ).resolves.toBe(true);
  expect(lifecycle.execute).toHaveBeenCalledWith("drain", { action: "drain" });
});

test("reports missing lifecycle manager and leaves other routes", async () => {
  await expect(
    handleClusterLifecycleRoute({
      method: "POST",
      path: "/api/v1/cluster/lifecycle/apply",
      request: request({ action: "drain" }),
      response: response(),
    }),
  ).rejects.toMatchObject({ statusCode: 503 });
  await expect(
    handleClusterLifecycleRoute({ method: "GET", path: "/api/v1/cluster/lifecycle/apply" }),
  ).resolves.toBe(false);
});
