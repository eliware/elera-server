import { expect, jest, test } from "@jest/globals";

const loadConfiguration = jest.fn();
const prepareRecovery = jest.fn();
jest.unstable_mockModule("../../../src/runtime/startup/configuration.mjs", () => ({
  loadSupervisorStartupConfiguration: loadConfiguration,
}));
jest.unstable_mockModule("../../../src/runtime/recovery/startup.mjs", () => ({
  prepareSupervisorRecovery: prepareRecovery,
}));
const { prepareSupervisorStartup } =
  await import("../../../src/runtime/startup/recovery-preparation.mjs");

test("initializes observations before it prepares recovery", async () => {
  const order = [];
  const recoveryResult = {};
  loadConfiguration.mockResolvedValueOnce({ initialIntent: {}, args: [] });
  prepareRecovery.mockResolvedValueOnce(recoveryResult);
  const result = await prepareSupervisorStartup({
    config: { elera: true, httpPort: 80, clusterSize: 1 },
    identity: { name: "node.example.test" },
    log: { info: jest.fn(), debug: jest.fn() },
    telemetry: { start: () => order.push("telemetry") },
    observationStore: { initialize: async () => order.push("observation") },
    getDrained: () => false,
    recoverTraffic: async () => {},
    state: {},
    recoveryState: {},
    recoveryAudit: {},
    health: {},
  });
  expect(result.recoveryResult).toBe(recoveryResult);
  expect(order).toEqual(["telemetry", "observation"]);
});

test("rejects missing startup and traffic dependencies", async () => {
  const base = {
    config: { elera: true },
    identity: { name: "node.example.test" },
    log: { info: jest.fn() },
    telemetry: { start: jest.fn() },
    observationStore: {},
    getDrained: () => false,
    recoverTraffic: async () => {},
    state: {},
    recoveryState: {},
    recoveryAudit: {},
    health: {},
  };
  const invalid = [
    { config: undefined },
    { config: { elera: "yes" } },
    { identity: undefined },
    { identity: { name: "short" } },
    { log: {} },
    { telemetry: {} },
    { state: undefined },
    { recoveryState: undefined },
    { recoveryAudit: undefined },
    { health: undefined },
    { observationStore: undefined },
    { getDrained: undefined },
    { recoverTraffic: undefined },
  ];
  for (const changes of invalid)
    await expect(prepareSupervisorStartup({ ...base, ...changes })).rejects.toThrow(TypeError);
});
