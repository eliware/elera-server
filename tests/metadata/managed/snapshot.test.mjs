import { createManagedMetadataSnapshot } from "../../../src/metadata/managed/snapshot.mjs";

test("exports and restores every metadata table, including scoped tokens", async () => {
  const calls = [];
  const snapshot = createManagedMetadataSnapshot({
    query: async (sql) => {
      calls.push(sql);
      if (sql.startsWith("SELECT *"))
        return [
          [
            {
              token_id: "1",
              token_hash: "hash",
              physical_name: "elera_db_1",
              empty: null,
              nested: { role: "admin" },
            },
          ],
        ];
      return [[]];
    },
  });
  const data = await snapshot.exportMetadataSnapshot();
  expect(data.format).toBe(1);
  expect(data.tables.scoped_tokens).toEqual([
    {
      token_id: "1",
      token_hash: "hash",
      physical_name: "elera_db_1",
      empty: null,
      nested: { role: "admin" },
    },
  ]);
  await expect(snapshot.restoreMetadataSnapshot(data)).resolves.toMatchObject({ scopedTokens: 1 });
  expect(calls.some((sql) => sql.includes("DELETE FROM `elera_meta`.`scoped_tokens`"))).toBe(true);
  expect(
    calls.some((sql) =>
      /^INSERT INTO `elera_meta`\.`(?:metadata|applications|managed_databases|identities|grants_policy|scoped_tokens|artifacts|routing_assignments)` \([^)]*\) VALUES \(/.test(
        sql,
      ),
    ),
  ).toBe(true);
});

test("rejects malformed metadata snapshots", async () => {
  const snapshot = createManagedMetadataSnapshot({ query: async () => [[]] });
  await expect(snapshot.restoreMetadataSnapshot({ format: 9 })).rejects.toThrow(
    "metadata snapshot is invalid",
  );
});

test("rejects missing tables and invalid row columns", async () => {
  const snapshot = createManagedMetadataSnapshot({ query: async () => [[]] });
  await expect(snapshot.restoreMetadataSnapshot({ format: 1, tables: {} })).rejects.toThrow(
    "metadata snapshot omits metadata",
  );
  await expect(
    snapshot.restoreMetadataSnapshot({ format: 1, tables: { metadata: [{ "bad-column": 1 }] } }),
  ).rejects.toThrow("metadata snapshot row is invalid");
});

test("rejects managed database records without physical names", async () => {
  const names = [
    "metadata",
    "applications",
    "managed_databases",
    "identities",
    "grants_policy",
    "scoped_tokens",
    "artifacts",
    "routing_assignments",
  ];
  const tables = Object.fromEntries(names.map((name) => [name, []]));
  tables.managed_databases = [{ physical_name: null }];
  const snapshot = createManagedMetadataSnapshot({ query: async () => [[]] });
  await expect(snapshot.restoreMetadataSnapshot({ format: 1, tables })).rejects.toThrow(
    "metadata snapshot database is invalid",
  );
});
