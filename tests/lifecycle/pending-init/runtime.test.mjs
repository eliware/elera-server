import { EventEmitter } from "node:events";
import { expect, jest, test } from "@jest/globals";
import "../../../test-fixtures/suites/pending-init-runtime.mjs";
import {
  closePendingListener,
  startPendingInitRuntime,
} from "../../../src/lifecycle/pending-init/runtime.mjs";

test("loads the startPendingInitRuntime suite", () => {
  expect(typeof startPendingInitRuntime).toBe("function");
});

test("rejects a missing identity before registering runtime handlers", () => {
  expect(() => startPendingInitRuntime()).toThrow("shared runtime identity");
});

test("cleans handlers when shutdown cannot close the listener", () => {
  const failure = new Error("close failed");
  const runtime = startPendingInitRuntime({
    identity: { name: "node.example.test" },
    environment: {},
    createServerImpl: () => new EventEmitter(),
    listen: () => {},
    close: () => {
      throw failure;
    },
  });
  expect(() => runtime.shutdown()).toThrow(failure);
});

test("closes a pending listener once and logs close failures", () => {
  jest.useFakeTimers();
  const timer = setInterval(() => {}, 1000);
  const state = { listenerClosed: false, retryTimer: timer };
  const close = jest.fn(() => {
    throw new Error("close failed");
  });
  const logger = { warn: jest.fn() };
  closePendingListener(state, { close, server: {}, logger });
  closePendingListener(state, { close, server: {}, logger });
  expect(state.listenerClosed).toBe(true);
  expect(close).toHaveBeenCalledTimes(1);
  expect(logger.warn).toHaveBeenCalledWith(
    "Pending recovery listener close failed",
    expect.objectContaining({ error: expect.any(Error) }),
  );
  jest.useRealTimers();
});
