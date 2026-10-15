import { expect, jest, test } from "@jest/globals";
import { createPendingInitServer } from "../../../src/lifecycle/pending-init/server.mjs";
import {
  pendingClusterEnvironment,
  rootHeaders,
  withPendingInitServer,
} from "../../../test-fixtures/pending-init-server-harness.mjs";

const node = "elera-0.cluster.local";
const createServer = (options = {}) =>
  createPendingInitServer({ identity: { name: node }, ...options }).server;

const post = (base, path, body = { confirm: true }, token = "root") =>
  fetch(`${base}${path}`, {
    method: "POST",
    headers: token ? rootHeaders(true) : { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

test("requires an identity and serves health and authenticated initialization", async () => {
  expect(() => createPendingInitServer()).toThrow("runtime identity is required");
  const initialize = jest.fn();
  const onInitialized = jest.fn();
  await withPendingInitServer(
    createServer({
      environment: pendingClusterEnvironment([{ name: node, address: node }]),
      initialize,
      onInitialized,
    }),
    async (base) => {
      expect((await fetch(`${base}/healthz`)).status).toBe(200);
      expect((await fetch(`${base}/readyz`)).status).toBe(503);
      expect((await post(base, "/api/v1/cluster/bootstrap", {}, null)).status).toBe(401);
      const response = await post(base, "/api/v1/cluster/bootstrap");
      expect(response.status).toBe(202);
      expect((await response.json()).operation).toBe("cluster.bootstrap");
      const standalone = await post(base, "/api/v1/initialization/apply");
      expect((await standalone.json()).operation).toBe("initialization.apply");
      await new Promise((resolve) => setImmediate(resolve));
      expect(initialize).toHaveBeenCalledTimes(2);
      expect(onInitialized).toHaveBeenCalledWith("bootstrap");
      expect(onInitialized).toHaveBeenCalledWith("standalone-init");
    },
  );
});

test("serves evidence and reset routes and rejects unknown paths", async () => {
  const coldEvidence = jest.fn().mockResolvedValue({ state: "ready" });
  const nodeDataReset = { reset: jest.fn().mockResolvedValue({ dryRun: true, status: "ready" }) };
  await withPendingInitServer(
    createServer({
      environment: { ROOT_TOKEN: "root" },
      coldEvidence,
      nodeDataReset,
    }),
    async (base) => {
      const evidence = await fetch(`${base}/api/v1/cluster/cold-bootstrap/evidence`, {
        headers: rootHeaders(),
      });
      expect(evidence.status).toBe(200);
      expect((await evidence.json()).data).toEqual({ state: "ready" });
      expect((await post(base, "/api/v1/node/data/reset", { dryRun: true })).status).toBe(200);
      expect(nodeDataReset.reset).toHaveBeenCalledWith({ dryRun: true });
      expect((await fetch(`${base}/unknown`)).status).toBe(503);
    },
  );
});

test("blocks bootstrap during recovery and serves recovery operations", async () => {
  const recoveryProtocol = {
    status: jest.fn().mockResolvedValue({ phase: "blocked" }),
    authorize: jest.fn().mockResolvedValue({ phase: "authorized" }),
    beginBootstrap: jest.fn().mockResolvedValue({ phase: "bootstrapping" }),
    complete: jest.fn().mockResolvedValue({ phase: "complete" }),
  };
  await withPendingInitServer(
    createServer({
      environment: pendingClusterEnvironment([
        { name: node, address: node },
        { name: "elera-1.cluster.local", address: "elera-1.cluster.local" },
      ]),
      recoveryRequired: true,
      recoveryReason: "quorum is unavailable",
      recoveryProtocol,
    }),
    async (base) => {
      const status = await fetch(`${base}/api/v1/cluster/cold-recovery/status`, {
        headers: rootHeaders(),
      });
      expect((await status.json()).data).toEqual({ phase: "blocked" });
      const blocked = await post(base, "/api/v1/cluster/bootstrap");
      expect(blocked.status).toBe(503);
      expect((await blocked.json()).reason).toBe("quorum is unavailable");
      expect((await post(base, "/api/v1/cluster/cold-recovery/authorize")).status).toBe(202);
      expect((await post(base, "/api/v1/cluster/cold-recovery/bootstrap")).status).toBe(202);
      expect((await post(base, "/api/v1/cluster/cold-recovery/complete")).status).toBe(202);
      const join = await post(base, "/api/v1/cluster/cold-recovery/join", {
        node: "elera-1.cluster.local",
      });
      expect(join.status).toBe(202);
      expect((await fetch(`${base}/unknown`)).status).toBe(503);
      await new Promise((resolve) => setImmediate(resolve));
      expect(recoveryProtocol.authorize).toHaveBeenCalledTimes(1);
      expect(recoveryProtocol.beginBootstrap).toHaveBeenCalledTimes(1);
      expect(recoveryProtocol.complete).toHaveBeenCalledTimes(1);
    },
  );
});

test("selects bootstrap or pending join from configured membership", async () => {
  const members = [
    { name: node, address: node },
    { name: "elera-1.cluster.local", address: "elera-1.cluster.local" },
  ];
  const environment = pendingClusterEnvironment(members);
  await withPendingInitServer(
    createServer({ environment, initialize: jest.fn() }),
    async (base) => {
      const response = await post(base, "/api/v1/initialization/apply");
      expect((await response.json()).operation).toBe("initialization.apply");
    },
  );
  const second = createPendingInitServer({
    environment,
    identity: { name: "elera-1.cluster.local" },
    initialize: jest.fn(),
  }).server;
  await withPendingInitServer(second, async (base) => {
    const response = await post(base, "/api/v1/initialization/apply");
    expect(response.status).toBe(202);
  });
  const unknownNode = createPendingInitServer({
    environment,
    identity: { name: "elera-2.cluster.local" },
    initialize: jest.fn(),
  }).server;
  await withPendingInitServer(unknownNode, async (base) => {
    expect((await post(base, "/api/v1/initialization/apply")).status).toBe(400);
  });
});
