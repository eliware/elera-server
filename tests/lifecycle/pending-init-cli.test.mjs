import { expect, jest, test } from "@jest/globals";
import { runPendingInitCli } from "../../src/lifecycle/pending-init-cli.mjs";

test("starts the pending-init runtime", () => {
  const start = jest.fn().mockReturnValue("started");
  expect(runPendingInitCli(start)).toBe("started");
  expect(start).toHaveBeenCalledTimes(1);
});
