import { expect, jest, test } from "@jest/globals";
import {
  createRecoveryEvidenceService,
  startRecoveryEvidenceService,
} from "../../../src/runtime/recovery/evidence-service.mjs";

test("creates default evidence dependencies without starting the listener", async () => {
  expect(() => createRecoveryEvidenceService()).toThrow("FQDN identity");
  const service = createRecoveryEvidenceService({
    identity: { name: "node-a.example.test" },
    dataDir: "/data",
    httpPort: 8080,
    token: "token",
    mariaProcess: { child: { exitCode: null } },
  });
  expect(service.evidence).toEqual(expect.any(Function));
  expect(service.routes).toBeDefined();
  await service.server.close();
});

test("starts evidence routes on a unified listener", async () => {
  const evidence = jest.fn();
  let mounted;
  const service = await startRecoveryEvidenceService({
    options: {
      identity: { name: "node-a.example.test" },
      dataDir: "/data",
      httpPort: 8080,
      createEvidence: () => evidence,
      createCompletion: () => ({}),
      createLease: () => ({}),
    },
    unifiedListener: true,
    setStartupHandler: (routes) => {
      mounted = routes;
    },
    identity: { name: "node-a.example.test" },
    httpPort: 8080,
    log: { debug: jest.fn() },
  });
  expect(service.server).toBeUndefined();
  expect(mounted).toBe(service.routes);
});

test("starts the dedicated evidence listener", async () => {
  const server = { listen: jest.fn() };
  const log = { debug: jest.fn() };
  await startRecoveryEvidenceService({
    options: {
      identity: { name: "node-a.example.test" },
      dataDir: "/data",
      httpPort: 8080,
      createEvidence: () => ({}),
      createCompletion: () => ({}),
      createLease: () => ({}),
      createServer: () => server,
    },
    identity: { name: "node-a.example.test" },
    httpPort: 8080,
    log,
  });
  expect(server.listen).toHaveBeenCalled();
  expect(log.debug).toHaveBeenCalled();
});

test("composes evidence, completion, lease, and server dependencies", () => {
  const evidence = { collect: jest.fn() };
  const completion = { complete: jest.fn() };
  const server = { listen: jest.fn() };
  const lease = { acquire: jest.fn() };
  const createEvidence = jest.fn((options) => {
    expect(options.node.name).toBe("node-a.example.test");
    expect(options.readState("/data")).toBeUndefined();
    expect(options.isActive()).toBe(true);
    return evidence;
  });
  const createCompletion = jest.fn(() => completion);
  const createLease = jest.fn(() => lease);
  const createServer = jest.fn((options) => {
    expect(options.evidence).toBe(evidence);
    return server;
  });
  expect(
    createRecoveryEvidenceService({
      identity: { name: "node-a.example.test" },
      dataDir: "/data",
      httpPort: 8080,
      token: "token",
      mariaProcess: { child: { exitCode: null } },
      log: {},
      readState: () => undefined,
      createEvidence,
      createCompletion,
      createLease,
      createServer,
    }),
  ).toEqual({ evidence, completion, server });
  expect(createLease).toHaveBeenCalledWith("/run/elera/cold-recovery.lease");
});

test("creates route-only evidence for the shared listener", () => {
  const evidence = jest.fn();
  const result = createRecoveryEvidenceService({
    identity: { name: "node-a.example.test" },
    dataDir: "/data",
    token: "token",
    mariaProcess: {},
    log: {},
    createEvidence: () => evidence,
    createCompletion: () => ({}),
    createLease: () => ({}),
    createServer: null,
  });
  expect(result.server).toBeUndefined();
  expect(result.routes).toBeDefined();
});

test("reads MariaDB activity from the current process controller", () => {
  let processController = {};
  let active;
  createRecoveryEvidenceService({
    identity: { name: "node-a.example.test" },
    dataDir: "/data",
    token: "token",
    getMariaProcess: () => processController,
    log: {},
    createEvidence: (options) => {
      active = options.isActive;
      return {};
    },
    createCompletion: () => ({}),
    createLease: () => ({}),
    createServer: null,
  });
  expect(active()).toBe(false);
  processController = { child: { exitCode: null } };
  expect(active()).toBe(true);
});
