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
});
