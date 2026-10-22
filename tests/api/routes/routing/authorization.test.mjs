import { expect, test } from "@jest/globals";
import {
  allowed,
  assertBoundResource,
  boundResource,
} from "../../../../src/api/routes/routing/authorization.mjs";

test("allows root and scoped access", () => {
  expect(allowed({ root: true }, "routing:read")).toBe(true);
  expect(allowed({ scopes: ["*"] }, "routing:read")).toBe(true);
  expect(allowed({ scopes: ["routing:read"] }, "routing:read")).toBe(true);
  expect(allowed({ scopes: [] }, "routing:read")).toBe(false);
  expect(allowed(undefined, "routing:read")).toBeFalsy();
});

test("rejects resources outside token bindings", () => {
  expect(() => assertBoundResource({ identity: "one" }, { identity: "two" })).toThrow(
    "requested resource is not approved for this token",
  );
  expect(() => assertBoundResource({ application: "one" }, { application: "two" })).toThrow(
    "requested resource is not approved for this token",
  );
  expect(() => assertBoundResource({ identity: "one" }, { identity: "one" })).not.toThrow();
});

test("returns scoped resource bindings and no bindings for root", () => {
  expect(boundResource({ identity: "user", application: "app", database: "db" })).toEqual({
    identity: "user",
    application: "app",
    database: "db",
  });
  expect(boundResource({ root: true, identity: "user" })).toEqual({});
  expect(boundResource(undefined)).toEqual({});
});
