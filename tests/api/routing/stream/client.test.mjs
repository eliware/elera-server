import { EventEmitter } from "node:events";
import { expect, jest, test } from "@jest/globals";
import { connectRoutingStreamClient } from "../../../../src/api/routing/stream/client.mjs";

test("sends the initial event and filters events by application", () => {
  const socket = Object.assign(new EventEmitter(), {
    readyState: 1,
    send: jest.fn(),
    ping: jest.fn(),
  });
  const sockets = new Set();
  const unsubscribe = jest.fn();
  const subscribe = jest.fn((_client, filter) => {
    expect(filter({ application: "billing" })).toBe(true);
    expect(filter({ application: "other" })).toBe(false);
    return unsubscribe;
  });
  connectRoutingStreamClient({
    socket,
    request: { url: "/?application=billing" },
    bus: { subscribe },
    getEvent: (application) => ({ application }),
    sockets,
  });
  expect(socket.send).toHaveBeenCalledWith('{"application":"billing"}');
  socket.emit("close");
  expect(unsubscribe).toHaveBeenCalledTimes(1);
  expect(sockets.size).toBe(0);
});

test("records valid telemetry and logs invalid messages and socket errors", () => {
  const socket = Object.assign(new EventEmitter(), {
    readyState: 0,
    send: jest.fn(),
    ping: jest.fn(),
  });
  const telemetry = { accept: jest.fn() };
  const log = { warn: jest.fn() };
  connectRoutingStreamClient({
    socket,
    request: { url: "/", eleraAuthorization: { application: "billing" } },
    bus: { subscribe: jest.fn(() => jest.fn()) },
    getEvent: jest.fn(),
    telemetry,
    log,
    sockets: new Set(),
  });
  socket.emit("message", Buffer.from('{"type":"routing.event"}'));
  socket.emit("message", Buffer.from("invalid"));
  socket.emit("error", new Error("socket failure"));
  expect(telemetry.accept).toHaveBeenCalledWith({ type: "routing.event" });
  expect(log.warn).toHaveBeenCalledTimes(2);
});

test("uses the default application and exposes socket controls", () => {
  const socket = Object.assign(new EventEmitter(), {
    readyState: 0,
    send: jest.fn(),
    ping: jest.fn(),
  });
  let client;
  let filter;
  connectRoutingStreamClient({
    socket,
    request: { url: "/" },
    bus: {
      subscribe: (value, selected) => {
        client = value;
        filter = selected;
        return jest.fn();
      },
    },
    getEvent: () => ({ type: "initial" }),
    sockets: new Set(),
  });
  expect(filter({})).toBe(true);
  expect(filter({ application: "other" })).toBe(false);
  expect(client.send({ type: "blocked" })).toBe(false);
  client.ping();
  expect(socket.send).not.toHaveBeenCalled();
  expect(socket.ping).toHaveBeenCalledTimes(1);
});
