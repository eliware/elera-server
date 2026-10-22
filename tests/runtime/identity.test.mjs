import { expect, jest, test } from "@jest/globals";
import { fullyQualifiedHostname, runtimeIdentity } from "../../src/runtime/identity.mjs";

test("uses only the supplied valid hostname", () => {
  expect(runtimeIdentity({ hostname: () => "node.cluster.local" })).toEqual({
    name: "node.cluster.local",
  });
});

test("rejects empty hostname output", () => {
  expect(() => runtimeIdentity({ hostname: () => "  " })).toThrow(
    "hostname -f returned an empty runtime identity",
  );
});

test("rejects invalid short hostname output", () => {
  expect(() => runtimeIdentity({ hostname: () => "node" })).toThrow("invalid hostname");
});

test("propagates hostname command failure", () => {
  const failure = new Error("hostname unavailable");
  expect(() =>
    runtimeIdentity({
      hostname: () => {
        throw failure;
      },
    }),
  ).toThrow(failure);
});

test("runs the hostname command with the expected arguments", () => {
  const execFile = jest.fn(() => "node.cluster.local\n");
  expect(fullyQualifiedHostname(execFile)).toBe("node.cluster.local");
  expect(execFile).toHaveBeenCalledWith("hostname", ["-f"], { encoding: "utf8" });
});

test("wraps hostname command failures with runtime identity details", () => {
  const failure = new Error("command failed");
  expect(() =>
    fullyQualifiedHostname(() => {
      throw failure;
    }),
  ).toThrow(
    expect.objectContaining({
      code: "RUNTIME_IDENTITY_UNAVAILABLE",
      cause: failure,
    }),
  );
});

test("rejects non-string hostname output", () => {
  expect(() => runtimeIdentity({ hostname: () => null })).toThrow(
    "hostname -f returned an empty runtime identity",
  );
});

test("uses the host command when no hostname provider is supplied", () => {
  expect(() => runtimeIdentity()).toThrow(/hostname -f/);
});
