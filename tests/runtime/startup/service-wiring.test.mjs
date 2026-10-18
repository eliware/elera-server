import { expect, jest, test } from "@jest/globals";

const createServices = jest.fn();
const createColdBootstrap = jest.fn();
let serviceOptions;
jest.unstable_mockModule("../../../src/runtime/startup/services.mjs", () => ({
  createSupervisorStartupServices: createServices,
}));
jest.unstable_mockModule("../../../src/runtime/cold/bootstrap-wiring.mjs", () => ({
  createSupervisorColdBootstrap: createColdBootstrap,
}));
const { wireSupervisorStartupServices } =
  await import("../../../src/runtime/startup/service-wiring.mjs");

test("stores startup services and cold bootstrap on shared state", () => {
  const localEvidence = { local: { node: "node-a" }, remote: [] };
  const services = { processController: {}, bootstrapLocal: jest.fn(), applyIntent: jest.fn() };
  const coldBootstrap = {};
  createServices.mockImplementationOnce((options) => {
    serviceOptions = options;
    return services;
  });
  createColdBootstrap.mockReturnValueOnce(coldBootstrap);
  const state = {};
  wireSupervisorStartupServices({
    recoveryResult: {
      localEvidence,
      members: [],
      startupDecision: { mode: "bootstrap", localWinner: true, epoch: 3 },
      coldRecoveryProtocol: {},
      recoveryCompletion: {},
    },
    state,
    config: { elera: true },
    recoveryState: { set: jest.fn() },
    recoveryAudit: {},
    health: {},
    loadEnvironmentIntent: jest.fn(),
    intentState: { apply: jest.fn() },
    log: { info: jest.fn() },
  });
  expect(state.coldBootstrapService).toBe(coldBootstrap);
  expect(state.coldEvidence).toBe(localEvidence.local);
  expect(state.mariaProcess).toBe(services.processController);
  expect(state.bootstrapMaria).toBeUndefined();
  expect(serviceOptions.isRestarting()).toBeUndefined();
  serviceOptions.setRestarting(true);
  expect(serviceOptions.isRestarting()).toBe(true);
  expect(serviceOptions.shuttingDown()).toBeUndefined();
  serviceOptions.loadIntent();
  const exit = jest.spyOn(process, "exit").mockImplementation(() => {});
  serviceOptions.onFatal(3);
  expect(exit).toHaveBeenCalledWith(3);
  exit.mockRestore();
});

test("skips bootstrap state for a non-bootstrap decision", () => {
  const recoveryState = { set: jest.fn() };
  createServices.mockReturnValueOnce({});
  wireSupervisorStartupServices({
    recoveryResult: {
      localEvidence: { local: {}, remote: [] },
      members: [],
      startupDecision: { mode: "join" },
    },
    state: {},
    config: { elera: false },
    recoveryState,
    recoveryAudit: {},
    health: {},
    log: { info: jest.fn() },
  });
  expect(recoveryState.set).not.toHaveBeenCalled();
});
