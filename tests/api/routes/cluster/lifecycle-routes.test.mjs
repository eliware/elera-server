import { expect, test, jest } from "@jest/globals";
import { handleClusterLifecycleRoute } from "../../../../src/api/routes/cluster/lifecycle-routes.mjs";

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
      auth: { root: true },
    }),
  ).resolves.toBe(true);
  expect(planned.json).toHaveBeenCalledWith(200, expect.objectContaining({ status: "planned" }));
  const lifecycle = { execute: jest.fn(async () => ({ status: "completed" })) };
  const applied = response();
  await expect(
    handleClusterLifecycleRoute({
      method: "POST",
      path: "/api/v1/cluster/lifecycle/apply",
      request: request({ action: "drain", confirm: true }),
      response: applied,
      lifecycle,
      enabled: true,
      nodeId: "node.example.test",
      auth: { root: true },
    }),
  ).resolves.toBe(true);
  expect(lifecycle.execute).toHaveBeenCalledWith("drain", { action: "drain", confirm: true });
});

test("reports missing lifecycle manager and leaves other routes", async () => {
  await expect(
    handleClusterLifecycleRoute({
      method: "POST",
      path: "/api/v1/cluster/lifecycle/apply",
      request: request({ action: "drain", confirm: true }),
      response: response(),
      auth: { root: true },
    }),
  ).rejects.toMatchObject({ statusCode: 503 });
  await expect(
    handleClusterLifecycleRoute({ method: "GET", path: "/api/v1/cluster/lifecycle/apply" }),
  ).resolves.toBe(false);
  await expect(
    handleClusterLifecycleRoute({ method: "POST", path: "/other", auth: { root: true } }),
  ).resolves.toBe(false);
  await expect(
    handleClusterLifecycleRoute({
      method: "POST",
      path: "/api/v1/cluster/lifecycle/plan",
      request: request({ action: "join" }),
      response: response(),
      auth: { scopes: [] },
    }),
  ).resolves.toBe(false);
  await expect(
    handleClusterLifecycleRoute({
      method: "POST",
      path: "/api/v1/cluster/lifecycle/apply",
      request: request({ action: "drain" }),
      response: response(),
      auth: { root: true },
    }),
  ).rejects.toMatchObject({ statusCode: 409 });
});

test("supports documented join, leave, and recovery aliases", async () => {
  const lifecycle = { execute: jest.fn(async (action) => ({ action })) };
  for (const [path, action] of [
    ["/api/v1/cluster/join", "join"],
    ["/api/v1/cluster/leave", "leave"],
    ["/api/v1/cluster/recover", "recover"],
  ]) {
    await expect(
      handleClusterLifecycleRoute({
        method: "POST",
        path,
        request: request({ confirm: true }),
        response: response(),
        lifecycle,
        auth: { scopes: ["cluster:operate"] },
      }),
    ).resolves.toBe(true);
    expect(lifecycle.execute).toHaveBeenLastCalledWith(action, { confirm: true, action });
  }
});
