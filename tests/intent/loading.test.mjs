import { expect, test } from "@jest/globals";
import { defaultIntent, loadIntent } from "../../src/intent/loading.mjs";

test("builds and validates the default intent", () => {
  const identity = { name: "node.example.test" };
  const intent = defaultIntent({ MARIADB_DATA_DIR: "/data" }, identity);
  expect(intent.mariadb.dataDir).toBe("/data");
  expect(loadIntent({}, identity)).toMatchObject({ kind: "SupervisorIntent" });
});

test("rejects missing identity and malformed intent JSON", () => {
  expect(() => defaultIntent({}, undefined)).toThrow("runtime identity");
  expect(() => loadIntent({ SUPERVISOR_INTENT_JSON: "{" })).toThrow(
    "invalid SUPERVISOR_INTENT_JSON",
  );
  expect(() => loadIntent({ SUPERVISOR_INTENT_JSON: "{}" })).toThrow(
    expect.objectContaining({ code: "INVALID_INTENT" }),
  );
});

test("uses process environment defaults when callers omit the environment", () => {
  const original = process.env.SUPERVISOR_INTENT_JSON;
  delete process.env.SUPERVISOR_INTENT_JSON;
  try {
    expect(() => defaultIntent()).toThrow("runtime identity");
    expect(() => loadIntent()).toThrow("runtime identity");
  } finally {
    if (original === undefined) delete process.env.SUPERVISOR_INTENT_JSON;
    else process.env.SUPERVISOR_INTENT_JSON = original;
  }
});
