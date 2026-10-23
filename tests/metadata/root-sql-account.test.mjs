import { ensureRootSqlAccount } from "../../src/metadata/root-sql-account.mjs";

test("creates the persistent root SQL account with global privileges", async () => {
  const calls = [];
  const result = await ensureRootSqlAccount({
    query: async (sql) => calls.push(sql),
    token: "root-secret",
  });
  expect(result.username).toBe("elera_root");
  expect(calls.some((sql) => sql.includes("IDENTIFIED BY 'root-secret'"))).toBe(true);
  expect(calls.some((sql) => sql.includes("GRANT ALL PRIVILEGES ON *.*"))).toBe(true);
});

test("requires a root token", async () => {
  await expect(ensureRootSqlAccount({ query: async () => {} })).rejects.toThrow(
    "root token is required",
  );
});

test("requires a SQL query function", async () => {
  await expect(ensureRootSqlAccount({ token: "secret" })).rejects.toThrow(
    "query function is required",
  );
});
