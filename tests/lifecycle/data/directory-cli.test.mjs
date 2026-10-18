import { expect, test } from "@jest/globals";
import { runDataDirectoryCli } from "../../../src/lifecycle/data/directory-cli.mjs";

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
});
