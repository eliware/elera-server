import { expect, test } from "@jest/globals";
import { exportAccounts, importAccounts } from "../../../src/api/routes/account-transfer.mjs";

const request = (body) => ({
  async *[Symbol.asyncIterator]() {
    yield JSON.stringify(body);
  },
});

test("exports users and removes credentials from grants", async () => {
  let queryText = "";
  const db = {
    query: async (sql) => {
      if (!queryText) queryText = sql;
      return sql.startsWith("SELECT")
        ? [[{ User: "app", Host: "%" }]]
        : [[{ grant: "GRANT USAGE IDENTIFIED BY PASSWORD 'hash'" }]];
    },
  };
  await expect(exportAccounts(db)).resolves.toEqual([
    { user: "app", host: "%", grants: ["GRANT USAGE"] },
  ]);
  expect(queryText).toContain("User NOT LIKE 'elera_t_%'");
  expect(queryText).toContain("'elera_root'");
});

test("exports accounts when grant lookup fails or returns no grant", async () => {
  let calls = 0;
  const db = {
    query: async (sql) => {
      if (sql.startsWith("SELECT"))
        return [
          [
            { User: "one", Host: "%" },
            { User: "two", Host: "localhost" },
          ],
        ];
      calls += 1;
      if (calls === 1) throw new Error("grant lookup failed");
      return [[{}]];
    },
  };
  await expect(exportAccounts(db)).resolves.toEqual([
    { user: "one", host: "%", grants: [] },
    { user: "two", host: "localhost", grants: [] },
  ]);
});

test("imports confirmed accounts and returns the completed operation", async () => {
  const statements = [];
  const db = { query: async (sql) => (statements.push(sql), [[]]) };
  await expect(
    importAccounts(
      request({
        confirm: true,
        accounts: [{ user: "app", grants: ["GRANT SELECT ON db.* TO app"] }],
      }),
      db,
    ),
  ).resolves.toEqual({
    ok: true,
    operation: "accounts.import",
    changed: true,
    status: "completed",
    count: 1,
  });
  expect(statements).toEqual([
    "CREATE USER IF NOT EXISTS 'app'@'%'",
    "GRANT SELECT ON db.* TO app",
  ]);
});

test("imports an empty list and requires confirmation", async () => {
  const db = { query: async () => [[]] };
  await expect(importAccounts(request({ confirm: true }), db)).resolves.toMatchObject({ count: 0 });
  await expect(importAccounts(request({ accounts: [] }), db)).rejects.toMatchObject({
    statusCode: 409,
  });
});

test.each(["DROP DATABASE app", "GRANT SELECT ON db.* TO app;", "GRANT SELECT -- unsafe"])(
  "rejects unsafe imported grant %s",
  async (grant) => {
    await expect(
      importAccounts(request({ confirm: true, accounts: [{ user: "app", grants: [grant] }] }), {
        query: async () => [[]],
      }),
    ).rejects.toMatchObject({ statusCode: 400, message: "invalid grant statement" });
  },
);
