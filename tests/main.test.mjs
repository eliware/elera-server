import { join as __fixture6_join } from "node:path";
import {
  describe as __fixture5_describe,
  expect as __fixture5_expect,
  test as __fixture5_test,
} from "@jest/globals";
import * as __fixture5_common from "@eliware/common";
import * as __fixture5_mysql from "@eliware/elera-lib";
import { expect, jest, test } from "@jest/globals";

jest.unstable_mockModule("../src/runtime/application-context.mjs", () => ({
  createSupervisorApplicationContext: jest.fn(),
}));
jest.unstable_mockModule("../src/runtime/recovery/join/wiring.mjs", () => ({
  createSupervisorRecoveryJoiner: jest.fn(),
}));
jest.unstable_mockModule("../src/runtime/startup/coordinator.mjs", () => ({
  startSupervisor: jest.fn(),
}));

const [{ main }, contextModule, joinerModule, startupModule] = await Promise.all([
  import("../src/main.mjs"),
  import("../src/runtime/application-context.mjs"),
  import("../src/runtime/recovery/join/wiring.mjs"),
  import("../src/runtime/startup/coordinator.mjs"),
]);

const context = () => {
  const recover = jest.fn();
  return {
    identity: { name: "node.example.test" },
    config: { startupTimeoutMs: 5000, httpPort: 8080 },
    dbEnv: { socket: "/run/mysqld.sock" },
    state: { signals: { shutdown: jest.fn() } },
    restartMarker: { clean: true },
    recoveryState: { state: "ready" },
    recoveryAudit: { record: jest.fn() },
    telemetry: { event: jest.fn() },
    composition: {
      intentState: { apply: jest.fn() },
      observationStore: { snapshot: jest.fn() },
      routingEnvironment: { clusterSize: 1 },
      sharedRoutingAssignments: { read: jest.fn() },
      health: { status: jest.fn() },
      probes: { ready: jest.fn() },
      routingEvent: { publish: jest.fn() },
      routingBus: { publish: jest.fn() },
      traffic: { recover, getDrained: jest.fn() },
    },
  };
};

test("starts the supervisor with the composed runtime", async () => {
  const runtime = context();
  const createContext = jest.fn(() => runtime);
  const createJoiner = jest.fn(() => "joiner");
  const start = jest.fn();
  await main({
    environment: { ROOT_TOKEN: "root" },
    logger: { error: jest.fn() },
    createContext,
    createJoiner,
    start,
  });
  expect(createContext).toHaveBeenCalledWith({
    environment: { ROOT_TOKEN: "root" },
    log: expect.any(Object),
  });
  expect(createJoiner).toHaveBeenCalledWith(
    expect.objectContaining({ identity: runtime.identity, token: "root" }),
  );
  expect(start).toHaveBeenCalledWith(
    expect.objectContaining({ identity: runtime.identity, recoverJoiners: "joiner" }),
  );
});

test("uses the default startup dependencies", async () => {
  jest.clearAllMocks();
  const runtime = context();
  contextModule.createSupervisorApplicationContext.mockReturnValue(runtime);
  joinerModule.createSupervisorRecoveryJoiner.mockReturnValue("default joiner");

  await main();

  expect(contextModule.createSupervisorApplicationContext).toHaveBeenCalledWith({
    environment: process.env,
    log: expect.any(Object),
  });
  expect(joinerModule.createSupervisorRecoveryJoiner).toHaveBeenCalled();
  expect(startupModule.startSupervisor).toHaveBeenCalledWith(
    expect.objectContaining({ environment: process.env, recoverJoiners: "default joiner" }),
  );
});

test("logs startup errors and shuts down the runtime", async () => {
  const runtime = context();
  const logger = { error: jest.fn() };
  const exit = jest.fn();
  await main({
    createContext: () => runtime,
    start: async () => {
      throw new Error("failure");
    },
    logger,
    exit,
  });
  expect(logger.error).toHaveBeenCalledWith("Supervisor startup failed", {
    error: expect.any(Error),
  });
  expect(runtime.state.signals.shutdown).toHaveBeenCalledWith("startup-failure");
  expect(exit).toHaveBeenCalledWith(1);
});

{
  __fixture5_describe("shared dependencies", () => {
    __fixture5_test("expose the required APIs", () => {
      __fixture5_expect(typeof __fixture5_common.log.info).toBe("function");
      __fixture5_expect(typeof __fixture5_common.path).toBe("function");
      __fixture5_expect(typeof __fixture5_common.registerHandlers).toBe("function");
      __fixture5_expect(typeof __fixture5_common.registerSignals).toBe("function");
      __fixture5_expect(typeof __fixture5_mysql.validateBundle).toBe("function");
    });
  });
}
