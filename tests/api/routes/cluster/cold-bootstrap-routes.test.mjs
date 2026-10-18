import { expect, test, jest } from "@jest/globals";
import { handleClusterColdBootstrapRoute } from "../../../../src/api/routes/cluster/cold-bootstrap-routes.mjs";

const response = () => ({ json: jest.fn() });
const request = (body) => ({
  async *[Symbol.asyncIterator]() {
    yield JSON.stringify(body);
  },
});

test("plans and executes cold bootstrap", async () => {
  const service = {
    plan: jest.fn(async () => ({ eligible: true })),
    execute: jest.fn(async (body) => body),
  };
  const planned = response();
  await expect(
    handleClusterColdBootstrapRoute({
      method: "POST",
      path: "/api/v1/cluster/cold-bootstrap/plan",
      request: request({}),
      response: planned,
      service,
    }),
  ).resolves.toBe(true);
  expect(planned.json).toHaveBeenCalledWith(200, expect.objectContaining({ status: "planned" }));
  const completed = response();
  await expect(
    handleClusterColdBootstrapRoute({
      method: "POST",
      path: "/api/v1/cluster/cold-bootstrap",
      request: request({ confirm: true }),
      response: completed,
      service,
    }),
  ).resolves.toBe(true);
  expect(service.execute).toHaveBeenCalledWith({ confirm: true });
});

test("reports unavailable service and leaves unrelated routes", async () => {
  await expect(
    handleClusterColdBootstrapRoute({
      method: "POST",
      path: "/api/v1/cluster/cold-bootstrap/plan",
    }),
  ).rejects.toMatchObject({ statusCode: 503 });
  await expect(
    handleClusterColdBootstrapRoute({
      method: "POST",
      path: "/api/v1/cluster/cold-bootstrap/other",
    }),
  ).resolves.toBe(false);
});
