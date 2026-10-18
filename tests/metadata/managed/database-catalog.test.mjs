import { createManagedMetadataForTest } from "../../../test-fixtures/managed-metadata.mjs";
import { expect, test } from "@jest/globals";
import { createManagedDatabaseCatalog } from "../../../src/metadata/managed/database-catalog.mjs";

test("creates a managed database catalog", () => {
  const catalog = createManagedDatabaseCatalog({ query: async () => [[]], q: async () => [[]] });
  expect(Object.keys(catalog)).toEqual(["createDatabase", "listDatabases", "deleteDatabase"]);
});

test("confirms database deletion and returns dry-run results", async () => {
  const calls = [];
  const catalog = createManagedDatabaseCatalog({
    query: async (sql) => calls.push(sql),
    q: async (sql) =>
      sql.includes("'missing'")
        ? [[]]
        : [[{ name: "billing", physical_name: "elera_db_1", application: "payments" }]],
  });
  await expect(catalog.deleteDatabase({ databaseId: "db-1", dryRun: true })).resolves.toMatchObject(
    { status: "planned" },
  );
  await expect(
    catalog.deleteDatabase({ databaseId: "db-1", confirm: true }),
  ).resolves.toMatchObject({ status: "completed", changed: true });
  expect(calls.some((sql) => sql.includes("DROP DATABASE"))).toBe(true);
  await expect(catalog.deleteDatabase({ databaseId: "missing" })).rejects.toMatchObject({
    statusCode: 404,
  });
});

test("provisions a deterministic physical database while returning the logical name", async () => {
  const calls = [];
  const managed = createManagedMetadataForTest({
    credentialKey: "test-key",
    query: async (sql) => {
      calls.push(sql);
      return [[]];
    },
  });
  const result = await managed.createDatabase({ application: "payments", databaseName: "primary" });
  expect(result.database).toBe("primary");
  expect(result.physicalName).toMatch(/^elera_db_[0-9]+$/);
  expect(calls.some((sql) => sql.includes("physical_name"))).toBe(true);
  expect(
    calls.some((sql) => sql.includes(`CREATE DATABASE IF NOT EXISTS \`${result.physicalName}\``)),
  ).toBe(true);
});

test("reuses the existing physical mapping when provisioning an identity again", async () => {
  const calls = [];
  const managed = createManagedMetadataForTest({
    credentialKey: "test-key",
    query: async (sql) => {
      calls.push(sql);
      if (sql.includes("SELECT database_id"))
        return [[{ database_id: "db-1", physical_name: "elera_db_db-1" }]];
      return [[]];
    },
  });
  const result = await managed.createDatabase({ application: "payments", databaseName: "primary" });
  expect(result).toMatchObject({ databaseId: "db-1", physicalName: "elera_db_db-1" });
  expect(calls.some((sql) => sql.includes("CREATE DATABASE IF NOT EXISTS `elera_db_db-1`"))).toBe(
    true,
  );
});
