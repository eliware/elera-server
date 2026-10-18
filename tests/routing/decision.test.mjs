import { expect, test } from "@jest/globals";
import "../../test-fixtures/suites/routing-decision.mjs";
import { calculateRoutes } from "../../src/routing/decision.mjs";

test("loads the calculateRoutes suite", () => {
  expect(typeof calculateRoutes).toBe("function");
});
