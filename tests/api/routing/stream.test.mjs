import { expect, jest, test } from "@jest/globals";
import { EventEmitter } from "node:events";

class FakeWebSocketServer extends EventEmitter {
  handleUpgrade(_request, _socket, _head, callback) {
    callback(this.socket);
  }

  close(callback) {
    callback?.();
  }
}

jest.unstable_mockModule("ws", () => ({ WebSocketServer: FakeWebSocketServer }));
const { createRoutingStream } = await import("../../../src/api/routing/stream.mjs");

jest.useFakeTimers();
const bus = () => ({ subscribe: jest.fn(() => () => {}) });

test("rejects unauthenticated and unrelated upgrades", async () => {
  const stream = createRoutingStream({ token: "secret", getEvent: () => undefined, bus: bus() });
  const unauthorized = { write: jest.fn(), destroy: jest.fn() };
  await expect(
    stream.upgrade({ headers: {}, url: "/api/v1/routing/stream" }, unauthorized, Buffer.alloc(0)),
  ).resolves.toBe(false);
  expect(unauthorized.write).toHaveBeenCalledWith(expect.stringContaining("401 Not approved"));
  const unrelated = { write: jest.fn(), destroy: jest.fn() };
  await expect(
    stream.upgrade(
      { headers: { authorization: "Bearer secret" }, url: "/other" },
      unrelated,
      Buffer.alloc(0),
    ),
  ).resolves.toBe(false);
  expect(unrelated.destroy).not.toHaveBeenCalled();
  stream.close();
});

test("supports asynchronous scoped-token authorization by application", async () => {
  const authorize = jest.fn(
    async (token, application) => token === "app-secret" && application === "payments",
  );
  const stream = createRoutingStream({ authorize, getEvent: () => undefined, bus: bus() });
  const rejected = { write: jest.fn(), destroy: jest.fn() };
  await expect(
    stream.upgrade(
      {
        headers: { authorization: "Bearer wrong" },
        url: "/api/v1/routing/stream?application=payments",
      },
      rejected,
      Buffer.alloc(0),
    ),
  ).resolves.toBe(false);
  expect(authorize).toHaveBeenCalledWith("wrong", "payments");
  const defaultRejected = { write: jest.fn(), destroy: jest.fn() };
  await stream.upgrade(
    { headers: { authorization: "Bearer wrong" }, url: "/api/v1/routing/stream" },
    defaultRejected,
    Buffer.alloc(0),
  );
  expect(authorize).toHaveBeenLastCalledWith("wrong", null);
  stream.close();
});

test("uses the application resolved by the token when no selector is supplied", async () => {
  const websocketServer = new FakeWebSocketServer();
  const subscribe = jest.fn(() => () => {});
  const getEvent = jest.fn((application) => ({ type: "routing.update", application }));
  const stream = createRoutingStream({ getEvent, bus: { subscribe }, websocketServer });
  const request = {
    url: "/api/v1/routing/stream",
    eleraAuthorization: { application: "billing", database: "ledger" },
  };
  websocketServer.emit(
    "connection",
    { readyState: 1, send: jest.fn(), on: jest.fn(), ping: jest.fn(), close: jest.fn() },
    request,
  );
  expect(getEvent).toHaveBeenCalledWith("billing");
  expect(subscribe).toHaveBeenCalledWith(expect.anything(), expect.any(Function));
  expect(stream.isStopping()).toBe(false);
  stream.close();
  websocketServer.close();
});

test("rejects the default authorizer when no root token is configured", async () => {
  const stream = createRoutingStream({ getEvent: () => undefined, bus: bus() });
  const socket = { write: jest.fn(), destroy: jest.fn() };
  await expect(
    stream.upgrade({ headers: {}, url: "/api/v1/routing/stream" }, socket, Buffer.alloc(0)),
  ).resolves.toBe(false);
  expect(socket.write).toHaveBeenCalledWith(expect.stringContaining("401 Not approved"));
  stream.close();
});

test("rejects WebSocket upgrades after shutdown begins", async () => {
  const stream = createRoutingStream({ token: "secret", getEvent: () => undefined, bus: bus() });
  await stream.shutdown({ reason: "SIGTERM" });
  const socket = { write: jest.fn(), destroy: jest.fn() };
  await expect(
    stream.upgrade({ headers: {}, url: "/api/v1/routing/stream" }, socket, Buffer.alloc(0)),
  ).resolves.toBe(false);
  expect(socket.write).toHaveBeenCalledWith(expect.stringContaining("503 Process Unavailable"));
  expect(socket.destroy).toHaveBeenCalled();
});

test("closes cleanly when no routing clients are connected", async () => {
  const stream = createRoutingStream({ token: "secret", getEvent: () => undefined, bus: bus() });
  await expect(
    stream.shutdown({ reason: "SIGTERM", reconnectDeadlineMs: 60000 }),
  ).resolves.toBeUndefined();
  expect(stream.isStopping()).toBe(true);
});

test("requires header-authenticated clients and handles telemetry and closed sockets", async () => {
  const telemetry = {
    accept: jest.fn(() => {
      throw new Error("bad telemetry");
    }),
  };
  const logger = { warn: jest.fn() };
  const socket = new EventEmitter();
  Object.assign(socket, {
    readyState: 1,
    send: jest.fn(),
    ping: jest.fn(),
    close: jest.fn(),
  });
  const websocketServer = new FakeWebSocketServer();
  websocketServer.socket = socket;
  const stream = createRoutingStream({
    token: "secret",
    getEvent: () => undefined,
    bus: bus(),
    telemetry,
    log: logger,
    websocketServer,
  });
  await stream.upgrade(
    { headers: { authorization: "Bearer secret" }, url: "/api/v1/routing/stream" },
    { write: jest.fn(), destroy: jest.fn() },
    Buffer.alloc(0),
  );
  socket.emit("message", Buffer.from("not-json"));
  expect(telemetry.accept).not.toHaveBeenCalled();
  expect(logger.warn).toHaveBeenCalledWith("Invalid routing telemetry message", {
    error: expect.any(Error),
  });
  socket.emit("close");
  await stream.shutdown();
  stream.close();
});

test("protects the connection handler during the shutdown race and filters bus events", async () => {
  const websocketServer = new FakeWebSocketServer();
  let predicate;
  let connectedClient;
  const subscriptions = {
    subscribe: jest.fn((client, filter) => {
      connectedClient = client;
      predicate = filter;
      return () => {};
    }),
  };
  const stream = createRoutingStream({
    token: "secret",
    getEvent: () => ({ type: "routing.update" }),
    bus: subscriptions,
    websocketServer,
  });
  const socket = {
    readyState: 1,
    close: jest.fn(),
    on: jest.fn(),
    send: jest.fn((_payload, callback) => callback?.()),
    ping: jest.fn(),
  };
  websocketServer.emit("connection", socket, { url: "/api/v1/routing/stream?application=app" });
  expect(predicate({ application: "app" })).toBe(true);
  expect(predicate({ application: "other" })).toBe(false);
  connectedClient.ping();
  socket.on.mock.calls.find(([event]) => event === "error")?.[1](new Error("socket error"));
  await stream.shutdown();
  const lateSocket = { close: jest.fn() };
  websocketServer.emit("connection", lateSocket, { url: "/api/v1/routing/stream" });
  expect(lateSocket.close).toHaveBeenCalledWith(1012, "supervisor restarting");
  stream.close();
  websocketServer.close();
});
