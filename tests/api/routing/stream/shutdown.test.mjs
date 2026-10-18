import { expect, jest, test } from "@jest/globals";
import { broadcastRoutingShutdown } from "../../../../src/api/routing/stream/shutdown.mjs";

test("sends shutdown events and closes each active client", async () => {
  const active = { readyState: 1, send: jest.fn((data, done) => done()), close: jest.fn() };
  const closed = { readyState: 3, send: jest.fn(), close: jest.fn() };
  const broken = {
    readyState: 1,
    send: jest.fn(() => {
      throw new Error("socket closed");
    }),
    close: jest.fn(),
  };
  const version = await broadcastRoutingShutdown({
    sockets: new Set([active, closed, broken]),
    nodeIdentity: { name: "node.example.test" },
    loadBalancerEndpoint: "lb.example.test",
    event: { reason: "update" },
    reason: "update",
    version: 4,
  });
  expect(version).toBe(5);
  expect(JSON.parse(active.send.mock.calls[0][0])).toMatchObject({
    type: "routing.shutdown",
    version: 5,
    node: "node.example.test",
    loadBalancerEndpoint: "lb.example.test",
    reason: "update",
  });
  expect(active.close).toHaveBeenCalledWith(1012, "update");
  expect(closed.send).not.toHaveBeenCalled();
  expect(broken.close).toHaveBeenCalledWith(1012, "update");
});

test("uses default shutdown data without node identity", async () => {
  const socket = { readyState: 1, send: jest.fn((data, done) => done()), close: jest.fn() };
  await expect(broadcastRoutingShutdown({ sockets: [socket] })).resolves.toBe(1);
  expect(JSON.parse(socket.send.mock.calls[0][0])).not.toHaveProperty("node");
});
