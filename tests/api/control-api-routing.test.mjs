import { expect, jest, test } from "@jest/globals";
import { dispatchControlRoute } from "../../src/api/control-api-routing.mjs";

const names = [
  "status",
  "telemetry",
  "intent",
  "account",
  "recovery",
  "coldRecovery",
  "cluster",
  "traffic",
  "initialization",
  "metadata",
  "application",
  "nodeDataReset",
  "observation",
  "managed",
  "reconcile",
  "artifact",
  "routingAdmin",
  "routing",
  "routingResync",
];

test("calls handlers in order and returns the first handled result", async () => {
  const handlers = Object.fromEntries(
    names.map((name) => [name, jest.fn().mockResolvedValue(false)]),
  );
  handlers.routingResync.mockReturnValue(true);
  await expect(
    dispatchControlRoute(
      { metadata: {}, routingEvent: "event" },
      { applications: "apps" },
      handlers,
    ),
  ).resolves.toBe(true);
  expect(handlers.status).toHaveBeenCalledTimes(1);
  expect(handlers.routingResync).toHaveBeenCalledWith(
    expect.objectContaining({ metadata: {}, routingEvent: "event", getEvent: "event" }),
  );
});

test("skips metadata routes when metadata is not configured", async () => {
  const handlers = Object.fromEntries(
    names.map((name) => [name, jest.fn().mockResolvedValue(false)]),
  );
  await expect(dispatchControlRoute({}, {}, handlers)).resolves.toBe(false);
  expect(handlers.metadata).not.toHaveBeenCalled();
});

test("uses default handler and option objects", async () => {
  await expect(
    dispatchControlRoute({
      method: "GET",
      path: "/api/v1/status",
      getStatus: async () => ({ ready: true }),
      response: { json: jest.fn() },
    }),
  ).resolves.toBe(true);
});
