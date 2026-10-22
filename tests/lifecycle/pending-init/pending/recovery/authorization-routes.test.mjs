import { expect, jest, test } from "@jest/globals";
import { handlePendingRecoveryAuthorizationRoute } from "../../../../../src/lifecycle/pending-init/pending/recovery/authorization-routes.mjs";

const request = (path, body = {}) => ({
  method: "POST",
  url: `/api/v1/cluster/cold-recovery/${path}`,
  async *[Symbol.asyncIterator]() {
    yield JSON.stringify(body);
  },
});
const response = () => ({
  writeHead(status) {
    this.status = status;
    return this;
  },
  end(body) {
    this.body = body;
    return this;
  },
  once(event, callback) {
    this.finish = callback;
    return this;
  },
});

test("runs confirmed bootstrap and completion operations", async () => {
  const protocol = Object.fromEntries(
    ["authorize", "beginBootstrap", "complete"].map((name) => [
      name,
      async (body) => ({ name, body }),
    ]),
  );
  for (const [path, operation] of [
    ["bootstrap", "bootstrap"],
    ["complete", "complete"],
  ]) {
    const out = response();
    await expect(
      handlePendingRecoveryAuthorizationRoute({
        request: request(path, { epoch: "epoch", confirm: true }),
        response: out,
        protocol,
        onRecoveryBootstrap: jest.fn(),
        onRecoveryComplete: jest.fn(),
        log: { error: jest.fn() },
      }),
    ).resolves.toBe(true);
    expect(out.status).toBe(202);
    expect(out.body).toContain(`cluster.cold-recovery.${operation}`);
    if (out.finish) await out.finish();
  }
});

test("blocks HTTP recovery authorization outside the local lease coordinator", async () => {
  const out = response();
  const authorize = jest.fn();
  await handlePendingRecoveryAuthorizationRoute({
    request: request("authorize", { epoch: "epoch", confirm: true }),
    response: out,
    protocol: { authorize },
  });
  expect(out.status).toBe(403);
  expect(authorize).not.toHaveBeenCalled();
  const unconfirmed = response();
  await handlePendingRecoveryAuthorizationRoute({
    request: request("bootstrap", { epoch: "epoch" }),
    response: unconfirmed,
    protocol: { beginBootstrap: jest.fn() },
  });
  expect(unconfirmed.status).toBe(409);
});

test("handles missing protocol, bad input, missing operations, and operation errors", async () => {
  const unavailable = response();
  await handlePendingRecoveryAuthorizationRoute({
    request: request("authorize"),
    response: unavailable,
  });
  expect(unavailable.status).toBe(503);
  const malformed = response();
  const badRequest = {
    ...request("authorize"),
    [Symbol.asyncIterator]() {
      return {
        next: async () => {
          throw new Error("bad body");
        },
      };
    },
  };
  await handlePendingRecoveryAuthorizationRoute({
    request: badRequest,
    response: malformed,
    protocol: {},
  });
  expect(malformed.status).toBe(400);
  const missing = response();
  await handlePendingRecoveryAuthorizationRoute({
    request: request("complete", { confirm: true }),
    response: missing,
    protocol: {},
  });
  expect(missing.status).toBe(503);
  for (const [error, status] of [
    [Object.assign(new Error("bad"), { statusCode: 422, code: "E" }), 422],
    [new Error("bad"), 409],
  ]) {
    const out = response();
    await handlePendingRecoveryAuthorizationRoute({
      request: request("bootstrap", { confirm: true }),
      response: out,
      protocol: {
        beginBootstrap: async () => {
          throw error;
        },
      },
    });
    expect(out.status).toBe(status);
  }
  await expect(
    handlePendingRecoveryAuthorizationRoute({
      request: { ...request("authorize"), method: "GET" },
    }),
  ).resolves.toBe(false);
});

test("logs failed bootstrap and completion handoffs", async () => {
  for (const [path, option] of [
    ["bootstrap", "onRecoveryBootstrap"],
    ["complete", "onRecoveryComplete"],
  ]) {
    const out = response();
    const log = { error: jest.fn() };
    await handlePendingRecoveryAuthorizationRoute({
      request: request(path, { confirm: true }),
      response: out,
      protocol: { [path === "bootstrap" ? "beginBootstrap" : "complete"]: async () => ({}) },
      [option]: async () => {
        throw new Error("handoff failed");
      },
      log,
    });
    await out.finish();
    expect(log.error).toHaveBeenCalledTimes(1);
  }
  const out = response();
  await handlePendingRecoveryAuthorizationRoute({
    request: request("bootstrap", { confirm: true }),
    response: out,
    protocol: { beginBootstrap: async () => ({}) },
    onRecoveryBootstrap: async () => {
      throw new Error("handoff failed");
    },
    log: {},
  });
  await out.finish();
});
