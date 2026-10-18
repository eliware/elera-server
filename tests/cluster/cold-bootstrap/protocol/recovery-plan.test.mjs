import { expect, jest, test } from "@jest/globals";
import { createRecoveryPlanner } from "../../../../src/cluster/cold-bootstrap/protocol/recovery-plan.mjs";

jest.useFakeTimers();
test("returns a join plan when active primary evidence exists", async () => {
  const evidence = [{ node: "db.example.test", galera: { clusterSize: 3 } }];
  const publishEvent = jest.fn();
  const planner = createRecoveryPlanner({
    nodes: [{ name: "db.example.test" }],
    collect: async () => ({ evidence }),
    isActivePrimary: () => true,
    now: () => new Date(),
    persist: jest.fn(),
    publishEvent,
    debug: jest.fn(),
    setCurrent: jest.fn(),
  });
  await expect(planner.plan()).resolves.toMatchObject({
    eligible: true,
    mode: "join",
    expectedMembership: 3,
    evidence,
  });
  expect(publishEvent).toHaveBeenCalledWith({ type: "recovery.evidence-collected", evidence });
});

import { createColdRecoveryProtocol } from "../../../../src/cluster/cold-bootstrap/protocol.mjs";

const recoveryEvidence = (node, seqno) => ({
  node,
  state: { uuid: "cluster", seqno, safeToBootstrap: false },
  active: false,
  generation: 1,
  observedAt: new Date().toISOString(),
});

test("joins when a peer already reports an active Primary component", async () => {
  const active = {
    ...recoveryEvidence("b", 2),
    active: true,
    galera: {
      clusterUuid: "cluster",
      clusterStatus: "Primary",
      localState: "Synced",
      ready: true,
      clusterSize: 2,
    },
  };
  const store = {
    async read() {},
    async write(value) {
      return value;
    },
  };
  const protocol = createColdRecoveryProtocol({
    nodes: [
      { name: "a", local: true },
      { name: "b", url: "http://b" },
    ],
    localEvidence: async () => recoveryEvidence("a", 1),
    fetchEvidence: async () => active,
    store,
  });
  await expect(protocol.plan()).resolves.toMatchObject({
    eligible: true,
    mode: "join",
    reason: "primary component previously exists",
    expectedMembership: 2,
  });
});
