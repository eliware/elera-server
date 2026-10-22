import { expect, jest, test } from "@jest/globals";
import { startSupervisorCycles } from "../../src/runtime/cycle-wiring.mjs";

test("starts routing-only cycles without peers", () => {
  const startCycles = jest.fn(() => ({ routingTimer: "routing" }));
  expect(
    startSupervisorCycles({
      peers: [],
      identity: { name: "node.example.test" },
      store: {},
      health: { status: jest.fn() },
      publishRoutingEvent: jest.fn(),
      startCycles,
    }),
  ).toEqual({ routingTimer: "routing" });
  expect(startCycles).toHaveBeenCalledWith({ publishRoutingEvent: expect.any(Function) });
});

test("wires peer observation publishing when peers exist", () => {
  const startCycles = jest.fn((options) => ({
    routingTimer: options.publishRoutingEvent,
    peerTimer: options.publishPeers,
  }));
  const createPeerClient = jest.fn(() => ({ observe: jest.fn() }));
  const createPublisher = jest.fn(() => jest.fn());
  const result = startSupervisorCycles({
    peers: ["peer-a.example.test,peer-b.example.test"],
    token: "token",
    store: {},
    health: { status: jest.fn() },
    identity: { name: "node-a.example.test" },
    clusterId: "cluster",
    getDrained: () => false,
    publishRoutingEvent: jest.fn(),
    log: {},
    startCycles,
    createPeerClient,
    createPublisher,
  });
  expect(createPeerClient).toHaveBeenCalledWith({
    peers: ["peer-a.example.test", "peer-b.example.test"],
    token: "token",
    store: {},
    log: {},
  });
  expect(createPublisher).toHaveBeenCalledWith(
    expect.objectContaining({
      observationStore: {},
      clusterId: "cluster",
      node: { name: "node-a.example.test" },
    }),
  );
  expect(result.peerTimer).toEqual(expect.any(Function));
});

test("rejects incomplete cycle configuration and invalid peer identities", () => {
  expect(() => startSupervisorCycles()).toThrow("valid hostname");
  const base = {
    identity: { name: "node.example.test" },
    store: {},
    health: { status: jest.fn() },
    publishRoutingEvent: jest.fn(),
  };
  expect(() => startSupervisorCycles(base)).toThrow("configured cycle peers");
  expect(() => startSupervisorCycles({ ...base, peers: ["short"] })).toThrow("valid identities");
  expect(() => startSupervisorCycles({ ...base, peers: [{ name: "short" }] })).toThrow(
    "valid identities",
  );
  expect(() =>
    startSupervisorCycles({
      ...base,
      peers: [{ name: "peer.example.test" }],
      startCycles: jest.fn(),
      store: { upsert: jest.fn() },
      createPeerClient: jest.fn(() => ({})),
      createPublisher: jest.fn(() => jest.fn()),
    }),
  ).not.toThrow();
  expect(() => startSupervisorCycles({ ...base, peers: [], store: null })).toThrow("dependencies");
  expect(() => startSupervisorCycles({ ...base, peers: [], identity: { name: "node" } })).toThrow(
    "valid hostname",
  );
});
