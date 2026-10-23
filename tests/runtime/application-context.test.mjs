import { expect, jest, test } from "@jest/globals";
import { createSupervisorApplicationContext } from "../../src/runtime/application-context.mjs";

const makeDependencies = () => {
  const identity = { name: "node.example.test" };
  const config = { dataDir: "/data" };
  const runtime = {
    lifecycle: {},
    telemetry: {},
    recoveryState: {},
    recovery: {},
    recoveryAudit: {},
  };
  const signals = { shutdown: jest.fn() };
  const traffic = {
    drain: { isDraining: jest.fn(() => false), active: jest.fn(() => 0) },
    clusterDrain: { set: jest.fn() },
  };
  let compositionOptions;
  const dependencies = {
    environment: { ELERA_CONFIG_STATE_DIR: "/state" },
    log: { info: jest.fn() },
    getIdentity: jest.fn(() => identity),
    loadConfig: jest.fn(() => config),
    getDbEnvironment: jest.fn(() => ({ socket: "/socket" })),
    createState: jest.fn(() => runtime),
    createRestartMarker: jest.fn(() => ({ clear: jest.fn() })),
    createComposition: jest.fn((options) => {
      compositionOptions = options;
      return {
        traffic,
        intentState: { apply: jest.fn() },
        lifecycleWiring: jest.fn(() => ({ signals })),
      };
    }),
  };
  return {
    dependencies,
    identity,
    config,
    runtime,
    signals,
    traffic,
    getCompositionOptions: () => compositionOptions,
  };
};

test("applies default dependencies when no options are provided", () => {
  try {
    const context = createSupervisorApplicationContext();
    expect(context.identity.name).toMatch(/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/);
    expect(context.config.runtimeIdentity).toBe(context.identity);
    expect(context.dbEnv.MYSQL_HOST).toBe("127.0.0.1");
  } catch (error) {
    expect(error.message).toMatch(/^hostname -f (?:failed|returned an empty|returned an invalid)/);
  }
});

test("builds the shared runtime context and callback links", () => {
  const data = makeDependencies();
  const context = createSupervisorApplicationContext(data.dependencies);
  const options = data.getCompositionOptions();
  expect(data.dependencies.loadConfig).toHaveBeenCalledWith(
    data.dependencies.environment,
    undefined,
    data.identity,
  );
  expect(data.dependencies.createRestartMarker).toHaveBeenCalledWith({
    path: "/state/clean-restart.json",
    node: data.identity.name,
    epoch: null,
  });
  expect(context).toMatchObject({
    identity: data.identity,
    config: data.config,
    state: { signals: data.signals },
  });
  expect(options.getDb()).toBeUndefined();
  options.setDrained(true);
  expect(options.getDrained()).toBe(true);
  expect(options.getTimers()).toEqual([undefined, undefined]);
  expect(options.getMariaProcess()).toBeUndefined();
  options.applyIntent({ id: "intent" });
  expect(context.composition.intentState.apply).toHaveBeenCalledWith({ id: "intent" });
  const cold = options.getColdState();
  expect(cold.drain.isDraining()).toBe(false);
  expect(cold.drain.active()).toBe(0);
  cold.clusterDrain.set(true);
  expect(data.traffic.clusterDrain.set).toHaveBeenCalledWith(true);
  expect(cold.bootstrapMaria()).toBeUndefined();
  expect(cold.coldBootstrapService()).toBeUndefined();
  expect(cold.coldEvidence()).toBeUndefined();
  expect(cold.coldRecoveryProtocol()).toBeUndefined();
  expect(cold.coldBootstrapLocal()).toBeUndefined();
});

test("uses the service state path when no override exists", () => {
  const data = makeDependencies();
  delete data.dependencies.environment.ELERA_CONFIG_STATE_DIR;
  createSupervisorApplicationContext(data.dependencies);
  expect(data.dependencies.createRestartMarker).toHaveBeenCalledWith(
    expect.objectContaining({ path: "/var/lib/elera/clean-restart.json" }),
  );
});
