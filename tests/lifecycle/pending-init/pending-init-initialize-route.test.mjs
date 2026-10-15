import { expect, jest, test } from "@jest/globals";
import { createPendingInitializationRoute } from "../../../src/lifecycle/pending-init/pending-init-initialize-route.mjs";
import {
  createPendingInitRequest as request,
  createPendingInitResponse as response,
} from "../../../test-fixtures/pending-init-route-harness.mjs";

test("ignores requests outside the initialization routes", async () => {
  const handle = createPendingInitializationRoute({});
  expect(await handle({ method: "GET", url: "/healthz" }, response())).toBe(false);
});

test("rejects initialization requests without authentication", async () => {
  const target = response();
  const handle = createPendingInitializationRoute({ authorized: () => false });
  expect(await handle({ method: "POST", url: "/api/v1/cluster/bootstrap" }, target)).toBe(true);
  expect(target.status).toBe(401);
  expect(JSON.parse(target.body)).toEqual({ ok: false, error: "authentication required" });
});

test("rejects invalid bodies and missing confirmation", async () => {
  const handle = createPendingInitializationRoute({ authorized: () => true });
  const invalid = {
    ...request("/api/v1/cluster/bootstrap"),
    async *[Symbol.asyncIterator]() {
      yield "{";
    },
  };
  const invalidResponse = response();
  await handle(invalid, invalidResponse);
  expect(invalidResponse.status).toBe(400);
  const missingResponse = response();
  await handle(request("/api/v1/cluster/bootstrap", { confirm: false }), missingResponse);
  expect(missingResponse.status).toBe(409);
});

test("blocks recovery bootstrap and unsupported lifecycle actions", async () => {
  const handle = createPendingInitializationRoute({
    authorized: () => true,
    recoveryRequired: true,
    recoveryReason: "quorum is unavailable",
  });
  const blocked = response();
  await handle(
    request("/api/v1/cluster/lifecycle/apply", { confirm: true, action: "bootstrap" }),
    blocked,
  );
  expect(blocked.status).toBe(503);
  const unsupported = response();
  await handle(
    request("/api/v1/cluster/lifecycle/apply", { confirm: true, action: "reset" }),
    unsupported,
  );
  expect(unsupported.status).toBe(400);
});

test("initializes and sends the completion hook after the response", async () => {
  const initialize = jest.fn();
  const onInitialized = jest.fn();
  const handle = createPendingInitializationRoute({
    authorized: () => true,
    initialize,
    onInitialized,
    environment: { MODE: "test" },
    log: { error: jest.fn() },
    standaloneOperation: () => "bootstrap",
  });
  const target = response();
  await handle(request("/api/v1/initialization/apply"), target);
  expect(target.status).toBe(202);
  expect(JSON.parse(target.body)).toMatchObject({
    operation: "initialization.apply",
    status: "completed",
  });
  expect(initialize).toHaveBeenCalledWith({
    environment: { MODE: "test" },
    log: expect.anything(),
  });
  target.finish();
  await Promise.resolve();
  expect(onInitialized).toHaveBeenCalledWith("bootstrap");
});

test("handles cluster bootstrap and join operations", async () => {
  const initialize = jest.fn();
  const handle = createPendingInitializationRoute({
    authorized: () => true,
    initialize,
    onInitialized: jest.fn(),
    log: { error: jest.fn() },
  });
  const bootstrapResponse = response();
  await handle(request("/api/v1/cluster/bootstrap"), bootstrapResponse);
  expect(JSON.parse(bootstrapResponse.body).operation).toBe("cluster.bootstrap");
  const joinResponse = response();
  await handle(request("/api/v1/cluster/join"), joinResponse);
  expect(JSON.parse(joinResponse.body).operation).toBe("cluster.join");
  const lifecycleJoinResponse = response();
  await handle(
    request("/api/v1/cluster/lifecycle/apply", { confirm: true, action: "join" }),
    lifecycleJoinResponse,
  );
  expect(JSON.parse(lifecycleJoinResponse.body).operation).toBe("cluster.join");
  expect(initialize).toHaveBeenCalledTimes(3);
});

test("reports initialization policy and operation errors", async () => {
  const log = { error: jest.fn() };
  const denied = createPendingInitializationRoute({
    authorized: () => true,
    standaloneOperation: () => {
      throw Object.assign(new Error("invalid identity"), { statusCode: 422 });
    },
    log,
  });
  const deniedResponse = response();
  await denied(request("/api/v1/initialization/apply"), deniedResponse);
  expect(deniedResponse.status).toBe(422);
  const fallback = createPendingInitializationRoute({
    authorized: () => true,
    standaloneOperation: () => {
      throw new Error("operation failed");
    },
    log,
  });
  const fallbackResponse = response();
  await fallback(request("/api/v1/initialization/apply"), fallbackResponse);
  expect(fallbackResponse.status).toBe(400);
  const failed = createPendingInitializationRoute({
    authorized: () => true,
    initialize: async () => {
      throw new Error("init failed");
    },
    standaloneOperation: () => "join-pending",
    log,
  });
  const failedResponse = response();
  await failed(request("/api/v1/initialization/apply"), failedResponse);
  expect(failedResponse.status).toBe(500);
  expect(log.error).toHaveBeenCalledWith("Pending initialization failed", expect.any(Object));
});

test("logs a failed completion hook", async () => {
  const log = { error: jest.fn() };
  const handle = createPendingInitializationRoute({
    authorized: () => true,
    initialize: jest.fn(),
    onInitialized: async () => {
      throw new Error("handoff failed");
    },
    standaloneOperation: () => "bootstrap",
    log,
  });
  const target = response();
  await handle(request("/api/v1/cluster/bootstrap"), target);
  target.finish();
  await new Promise((resolve) => setImmediate(resolve));
  expect(log.error).toHaveBeenCalledWith(
    "Pending initialization handoff failed",
    expect.objectContaining({ error: expect.any(Error) }),
  );
});

test("rejects concurrent initialization and skips the join-pending hook", async () => {
  let finish;
  const initialize = jest.fn(() => new Promise((resolve) => (finish = resolve)));
  const onInitialized = jest.fn();
  const handle = createPendingInitializationRoute({
    authorized: () => true,
    initialize,
    onInitialized,
    standaloneOperation: () => "join-pending",
    log: { error: jest.fn() },
  });
  const firstResponse = response();
  const first = handle(request("/api/v1/initialization/apply"), firstResponse);
  await Promise.resolve();
  const secondResponse = response();
  await handle(request("/api/v1/initialization/apply"), secondResponse);
  expect(secondResponse.status).toBe(409);
  finish();
  await first;
  firstResponse.finish();
  await Promise.resolve();
  expect(onInitialized).not.toHaveBeenCalled();
});
