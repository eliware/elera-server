import { expect, jest, test } from "@jest/globals";
import { createSupervisorControlOptions } from "../../../src/runtime/control/options.mjs";

test("builds control handlers from runtime services", () => {
  const query = jest.fn();
  const lease = jest.fn();
  const coldState = {
    drain: { isDraining: () => true, active: () => 2 },
    clusterDrain: { set: jest.fn() },
    bootstrapMaria: jest.fn(),
    coldBootstrapService: () => "bootstrap",
    coldRecoveryProtocol: () => "protocol",
    coldBootstrapLocal: () => "local",
  };
  const options = createSupervisorControlOptions({
    db: { query },
    routingBundles: { lease },
    cluster: "cluster",
    nodeDataReset: "reset",
    config: "config",
    health: { status: () => "status", cacheInfo: () => ({ cached: true }) },
    telemetry: { summary: () => "summary", details: () => "details" },
    coldState,
    lifecycle: { get: () => "running" },
    intentState: { state: "intent" },
    environment: {},
    identity: { name: "node.example.test" },
    applyIntent: (intent) => intent,
    log: "log",
  });
  options.db.query("sql");
  expect(options.getConfig()).toBe("config");
  expect(options.getStatus()).toBe("status");
  expect(options.getTelemetry()).toBe("summary");
  expect(options.getTelemetryDetails()).toBe("details");
  expect(options.getTraffic()).toEqual({
    drained: true,
    lifecycle: "running",
    active: 2,
    cached: true,
  });
  options.setDrain(false);
  options.bootstrap();
  expect(options.getColdBootstrap()).toBe("bootstrap");
  expect(options.getColdRecoveryProtocol()).toBe("protocol");
  expect(options.getColdBootstrapLocal()).toBe("local");
  expect(options.getActiveIntent.apply("next")).toBe("next");
  options.leaseCredentials({});
  expect(query).toHaveBeenCalledWith("sql");
  expect(lease).toHaveBeenCalled();
});

test("uses a live recovery provider when one exists", () => {
  const options = createSupervisorControlOptions({
    db: { query: () => {} },
    routingBundles: { lease: () => {} },
    coldState: { drain: {}, clusterDrain: {}, coldRecoveryProtocol: "fallback" },
    liveColdRecoveryProtocol: "live",
  });
  expect(options.getColdRecoveryProtocol()).toBe("live");
});
