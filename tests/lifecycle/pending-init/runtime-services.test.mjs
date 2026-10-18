import { expect, jest, test } from "@jest/globals";
import {
  createPendingInitRuntimeServices,
  listenPendingInitServer,
} from "../../../src/lifecycle/pending-init/runtime-services.mjs";

jest.useFakeTimers();
test("creates pending recovery dependencies and routes completion hooks", async () => {
  let options;
  const closePending = jest.fn();
  const handoff = jest.fn(() => jest.fn().mockResolvedValue(undefined));
  const logger = { error: jest.fn() };
  const services = createPendingInitRuntimeServices({
    environment: {},
    identity: { name: "node.example.test" },
    logger,
    recoveryRequired: true,
    recoveryReason: "blocked",
    recoveryProtocol: {},
    onRecoveryJoin: jest.fn(async () => "joined"),
    onRecoveryBootstrap: jest.fn(async () => true),
    onRecoveryComplete: jest.fn(),
    createEvidenceImpl: jest.fn(() => "evidence"),
    createResetImpl: jest.fn((value) => value),
    createServerImpl: jest.fn((value) => {
      options = value;
      return { close: jest.fn() };
    }),
    closePending,
    handoff,
  });
  await expect(options.onRecoveryJoin({})).resolves.toBe("joined");
  await options.onRecoveryBootstrap({});
  options.onInitialized("join-pending");
  options.onInitialized("bootstrap");
  expect(closePending).toHaveBeenCalledTimes(3);
  expect(handoff).toHaveBeenCalledWith(true);
  expect(services.coldEvidence).toBe("evidence");
  expect(options.onRecoveryComplete).toBeDefined();
});

test("closes pending servers on listener errors", async () => {
  const errorHandlers = { removeHandlers: jest.fn() };
  const logger = { error: jest.fn() };
  listenPendingInitServer({
    listen: () => Promise.reject(new Error("listen")),
    server: {},
    port: 80,
    errorHandlers,
    logger,
  });
  await Promise.resolve();
  expect(errorHandlers.removeHandlers).toHaveBeenCalled();
  expect(logger.error).toHaveBeenCalled();
  expect(() =>
    listenPendingInitServer({
      listen: () => {
        throw new Error("sync");
      },
      server: {},
      port: 80,
      errorHandlers,
      logger,
    }),
  ).toThrow("sync");
});
