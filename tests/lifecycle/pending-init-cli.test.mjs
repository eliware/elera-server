import { expect, jest, test } from "@jest/globals";
import { pathToFileURL } from "node:url";
import {
  runPendingInitCli,
  runPendingInitCliIfMain,
} from "../../src/lifecycle/pending-init-cli.mjs";

test("starts the pending-init runtime", () => {
  const start = jest.fn().mockReturnValue("started");
  expect(runPendingInitCli(start)).toBe("started");
  expect(start).toHaveBeenCalledTimes(1);
});

test("runs the CLI only when its script path matches the module URL", () => {
  const path = "C:\\app\\pending-init.mjs";
  const start = jest.fn();
  expect(runPendingInitCliIfMain(pathToFileURL(path).href, path, start)).toBeUndefined();
  expect(start).toHaveBeenCalledTimes(1);
  expect(
    runPendingInitCliIfMain(pathToFileURL(path).href, "C:\\app\\other.mjs", start),
  ).toBeUndefined();
  expect(start).toHaveBeenCalledTimes(1);
});
