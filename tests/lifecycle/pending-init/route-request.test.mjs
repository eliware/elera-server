import { expect, jest, test } from "@jest/globals";
import { routePendingInitRequest } from "../../../src/lifecycle/pending-init/route-request.mjs";

const handlers = (selection) => {
  const names = ["health", "evidence", "recovery", "recoveryAuth", "initialization", "reset"];
  const calls = [];
  const result = Object.fromEntries(
    names.map((name) => [
      name,
      jest.fn(() => {
        calls.push(name);
        return selection === name;
      }),
    ]),
  );
  result.fallback = jest.fn(() => calls.push("fallback"));
  return { handlers: result, calls };
};

test.each(["health", "evidence", "recovery", "recoveryAuth", "initialization", "reset"])(
  "stops request routing when %s handles the request",
  async (selection) => {
    const setup = handlers(selection);
    await routePendingInitRequest({}, {}, setup.handlers);
    expect(setup.calls).toEqual(
      ["health", "evidence", "recovery", "recoveryAuth", "initialization", "reset"].slice(
        0,
        ["health", "evidence", "recovery", "recoveryAuth", "initialization", "reset"].indexOf(
          selection,
        ) + 1,
      ),
    );
    expect(setup.handlers.fallback).not.toHaveBeenCalled();
  },
);

test("runs fallback when no route handles the request", async () => {
  const setup = handlers(undefined);
  await routePendingInitRequest({}, {}, setup.handlers);
  expect(setup.calls).toEqual([
    "health",
    "evidence",
    "recovery",
    "recoveryAuth",
    "initialization",
    "reset",
    "fallback",
  ]);
});
