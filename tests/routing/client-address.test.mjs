import { expect, jest, test } from "@jest/globals";

const execFileSync = jest.fn(() => "node.example.test\n");
jest.unstable_mockModule("node:child_process", () => ({ execFileSync }));
const { clientSqlAddress, nodeAddress } = await import("../../src/routing/client-address.mjs");

const resolver = (value) => () => value;

test("uses and caches a valid hostname for node routes", () => {
  const resolve = jest.fn(resolver("node.example.test"));
  expect(nodeAddress({}, resolve)).toBe("node.example.test");
  expect(nodeAddress({}, resolve)).toBe("node.example.test");
  expect(resolve).toHaveBeenCalledTimes(1);
});

test("rejects hostname resolution failures and invalid names", () => {
  const unavailable = () => {
    throw new Error("unavailable");
  };
  expect(() => nodeAddress({}, unavailable)).toThrow("hostname -f failed: unavailable");
  expect(() => nodeAddress({}, resolver("node"))).toThrow("valid hostname");
  expect(() => nodeAddress({}, resolver(" "))).toThrow("valid hostname");
});

test("uses and caches a valid hostname for SQL routes", () => {
  const resolve = jest.fn(resolver("db.example.test"));
  expect(clientSqlAddress({}, resolve)).toBe("db.example.test");
  expect(clientSqlAddress({}, resolve)).toBe("db.example.test");
  expect(resolve).toHaveBeenCalledTimes(1);
});

test("rejects SQL hostname resolution failures and invalid names", () => {
  const unavailable = () => {
    throw new Error("DNS unavailable");
  };
  expect(() => clientSqlAddress({}, unavailable)).toThrow("hostname -f failed: DNS unavailable");
  expect(() => clientSqlAddress({}, resolver("host"))).toThrow("valid hostname");
  expect(() => clientSqlAddress({}, resolver(" "))).toThrow("valid hostname");
});

test("uses the platform hostname resolver when no resolver is supplied", () => {
  expect(nodeAddress()).toBe("node.example.test");
  expect(clientSqlAddress()).toBe("node.example.test");
  expect(clientSqlAddress({})).toBe("node.example.test");
  expect(execFileSync).toHaveBeenCalledWith("hostname", ["-f"], { encoding: "utf8" });
});

test("rejects non-function hostname resolvers", () => {
  expect(() => nodeAddress({}, null)).toThrow("hostname resolver must be a function");
  expect(() => clientSqlAddress({}, null)).toThrow("FQDN resolver must be a function");
});
