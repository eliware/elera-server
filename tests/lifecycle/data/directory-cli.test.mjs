import { expect, jest, test } from "@jest/globals";
import { pathToFileURL } from "node:url";
import {
  runDataDirectoryCli,
  runDataDirectoryCliIfMain,
} from "../../../src/lifecycle/data/directory-cli.mjs";

test("reports the data-directory action", () => {
  const output = [];
  const action = runDataDirectoryCli(
    ["/data", "true"],
    (directory, options) => {
      expect(directory).toBe("/data");
      expect(options).toEqual({ bootstrap: true });
      return { action: "initialize" };
    },
    (value) => output.push(value),
  );
  expect(action).toBe("initialize");
  expect(output).toEqual(["initialize"]);
});

test("reports a failed data-directory action", () => {
  const output = [];
  const errors = [];
  runDataDirectoryCli(
    ["/data"],
    () => ({ action: "fail", message: "invalid" }),
    (value) => output.push(value),
    (value) => errors.push(value),
  );
  expect(output).toEqual(["fail"]);
  expect(errors).toEqual(["invalid"]);
});

test("requires a data-directory argument", () => {
  expect(() => runDataDirectoryCli([])).toThrow("data directory is required");
  let directory;
  runDataDirectoryCli(
    undefined,
    (value) => {
      directory = value;
      return { action: "start" };
    },
    jest.fn(),
    jest.fn(),
  );
  expect(directory).toBe(process.argv.slice(2)[0]);
});

test("runs the CLI only when its script path matches the module URL", () => {
  const path = "C:\\app\\directory-cli.mjs";
  const output = [];
  const result = runDataDirectoryCliIfMain(
    pathToFileURL(path).href,
    path,
    ["/data"],
    () => ({ action: "start" }),
    (value) => output.push(value),
    jest.fn(),
  );
  expect(result).toBe("start");
  expect(output).toEqual(["start"]);
  expect(
    runDataDirectoryCliIfMain(pathToFileURL(path).href, "C:\\app\\other.mjs", []),
  ).toBeUndefined();
});
