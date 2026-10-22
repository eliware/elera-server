import { expect, jest, test } from "@jest/globals";
import { createSupervisorStartupServices } from "../../../src/runtime/startup/services.mjs";

test("composes process, intent, and bootstrap services", () => {
  const onUnexpectedExit = jest.fn();
  const createProcessImpl = jest.fn(({ onUnexpectedExit: callback }) => {
    onUnexpectedExit.mockImplementation(callback);
    return { stop: jest.fn(), start: jest.fn() };
  });
  const result = createSupervisorStartupServices({
    args: [],
    config: {
      timeoutMs: 1,
      dataDir: "data",
      runtimeIdentity: { name: "node.example.test", address: "node.example.test" },
    },
    log: { error: jest.fn() },
    recoveryState: { set: jest.fn() },
    recoveryAudit: { failure: jest.fn() },
    isRestarting: () => false,
    setRestarting: jest.fn(),
    onFatal: jest.fn(),
    health: {},
    startupDecision: {},
    recoveryCompletion: {},
    coldRecoveryProtocol: {},
    startupServer: {},
    identity: undefined,
    signals: {},
    loadIntent: jest.fn(() => ({})),
    intentState: {},
    createProcessImpl,
  });
  expect(result.processController).toBeDefined();
  expect(result.applyIntent).toEqual(expect.any(Function));
  expect(result.bootstrapMaria).toEqual(expect.any(Function));
  expect(result.loadActiveIntent()).toEqual({});
  expect(result.loadActiveIntent.apply).toEqual(expect.any(Function));
  onUnexpectedExit(1);
});

test("rejects omitted startup service dependencies", () => {
  expect(() => createSupervisorStartupServices()).toThrow("startup services require");
});
