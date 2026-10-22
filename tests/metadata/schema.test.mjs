import { expect, test } from "@jest/globals";
import { META_DATABASE, META_SCHEMA } from "../../src/metadata/schema.mjs";

test("defines one canonical current schema for the metadata database", () => {
  expect(META_DATABASE).toBe("elera_meta");
  expect(META_SCHEMA.length).toBeGreaterThan(0);
  expect(META_SCHEMA).toContain(
    "CREATE INDEX IF NOT EXISTS idx_scoped_tokens_hash_active ON scoped_tokens (token_hash, active)",
  );
  expect(
    META_SCHEMA.every(
      (statement) => typeof statement === "string" && /CREATE (?:TABLE|INDEX)/.test(statement),
    ),
  ).toBe(true);
});
