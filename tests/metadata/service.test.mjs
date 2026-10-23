import { createMetadataService } from "../../src/metadata/service.mjs";
import { expect, jest, test } from "@jest/globals";
test("initializes metadata and verifies the schema", async () => {
  const calls = [];
  const query = async (sql) => {
    calls.push(sql);
    if (sql.startsWith("SELECT version"))
      return [
        [
          { version: 1 },
          { version: 2 },
          { version: 3 },
          { version: 4 },
          { version: 5 },
          { version: 6 },
          { version: 7 },
          { version: 8 },
        ],
      ];
    return [[]];
  };
  const service = createMetadataService({ query });
  const result = await service.initialize();
  expect(result.initialized).toBe(true);
  expect(result.database).toBe("elera_meta");
  expect(calls.some((sql) => sql.includes("CREATE DATABASE"))).toBe(true);
  expect((await service.verify()).verified).toBe(true);
});
test("creates the persistent root SQL account during initialization", async () => {
  const ensureRoot = jest.fn(async () => ({ username: "elera_root" }));
  const service = createMetadataService({ query: async () => [[]], tokenAccounts: { ensureRoot } });
  const result = await service.initialize({ ROOT_TOKEN: "root-token" });
  expect(ensureRoot).toHaveBeenCalledTimes(1);
  expect(result.rootSqlAccount).toEqual({ username: "elera_root" });
});
test("reports uninitialized metadata and validates dependencies", async () => {
  expect(() => createMetadataService({})).toThrow("query function");
  const service = createMetadataService({
    query: async () => {
      throw new Error("missing");
    },
  });
  expect((await service.status()).initialized).toBe(false);
});
