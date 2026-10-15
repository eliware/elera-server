import { expect, jest, test } from "@jest/globals";
import { createControlApi } from "../src/control-api.mjs";
import { createApiRequest, createApiResponse } from "../test-fixtures/control-api-harness.mjs";

const createApi = (options = {}) =>
  createControlApi({
    identity: { name: "node.example.test" },
    environment: { ROOT_TOKEN: "root" },
    log: { error: jest.fn() },
    ...options,
  });

test("requires a shared runtime identity", () => {
  expect(() => createControlApi()).toThrow("shared runtime identity is required");
});

test("ignores requests outside the API and rejects missing credentials", async () => {
  const { handler } = createApi();
  const outside = createApiResponse();
  await expect(handler(createApiRequest("GET", "/healthz"), outside)).resolves.toBe(false);
  const unauthorized = createApiResponse();
  await expect(
    handler(createApiRequest("GET", "/api/v1/status", { token: null }), unauthorized),
  ).resolves.toBe(true);
  expect(unauthorized.status).toBe(401);
});

test("dispatches an authenticated request and adds its request ID", async () => {
  const { handler } = createApi({ getStatus: async () => ({ ready: true }) });
  const target = createApiResponse();
  await expect(
    handler(createApiRequest("GET", "/api/v1/status", { requestId: "request-1" }), target),
  ).resolves.toBe(true);
  expect(target.status).toBe(200);
  expect(JSON.parse(target.body)).toMatchObject({
    apiVersion: "v1",
    requestId: "request-1",
    data: { ready: true },
  });
});

test("delegates credential revocation after route dispatch", async () => {
  const managed = {
    lease: jest.fn(),
    revokeIdentity: jest.fn().mockResolvedValue({ revoked: true }),
  };
  const { handler } = createApi({ managed });
  const target = createApiResponse();
  await handler(
    createApiRequest("POST", "/api/v1/credentials/revoke", {
      body: { identity: "runtime" },
    }),
    target,
  );
  expect(managed.revokeIdentity).toHaveBeenCalledWith("runtime");
  expect(JSON.parse(target.body).operation).toBe("credentials.revoke");
});

test("returns not found for an unhandled authenticated request", async () => {
  const { handler } = createApi({ getConfig: () => ({ elera: false }) });
  const target = createApiResponse();
  await handler(createApiRequest("GET", "/api/v1/unknown"), target);
  expect(target.status).toBe(404);
  expect(JSON.parse(target.body).error).toBe("endpoint not found");
});

test("maps route errors to logged API responses", async () => {
  const log = { error: jest.fn() };
  const { handler } = createApi({
    getStatus: async () => {
      throw new Error("status failed");
    },
    log,
  });
  const target = createApiResponse();
  await handler(createApiRequest("GET", "/api/v1/status"), target);
  expect(target.status).toBe(500);
  expect(JSON.parse(target.body).error).toBe("status failed");
  expect(log.error).toHaveBeenCalledTimes(1);
});
