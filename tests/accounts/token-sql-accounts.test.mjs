import { createTokenSqlAccounts } from "../../src/accounts/token-sql-accounts.mjs";

test("creates persistent token accounts with scoped grants", async () => {
  const calls = [];
  const accounts = createTokenSqlAccounts({
    query: async (sql) => {
      calls.push(sql);
      if (sql.includes("FROM elera_meta.identities"))
        return [[{ physical_name: "elera_db_1", grants_json: '["SELECT","INSERT"]' }]];
      return [[]];
    },
  });
  await accounts.create({
    tokenId: "123",
    token: "persistent-secret",
    application: "sample",
    identity: "worker",
    scopes: ["database:read"],
  });
  expect(calls.some((sql) => sql.includes("IDENTIFIED BY 'persistent-secret'"))).toBe(true);
  expect(calls.some((sql) => sql.includes("GRANT SELECT ON `elera_db_1`.*"))).toBe(true);
  expect(calls.some((sql) => sql.includes("GRANT SELECT, INSERT"))).toBe(false);
});

test("creates accounts with write grants and tolerates tokens without identities", async () => {
  const calls = [];
  const accounts = createTokenSqlAccounts({
    query: async (sql) => {
      calls.push(sql);
      return sql.includes("FROM elera_meta.identities")
        ? [[{ physical_name: "elera_db_1", grants_json: ["SELECT", "INSERT"] }]]
        : [[]];
    },
  });
  await accounts.create({
    tokenId: "9",
    token: "secret",
    application: "sample",
    identity: "worker",
    scopes: ["database:write"],
  });
  await accounts.create({ tokenId: "10", token: "secret", application: "sample" });
  expect(calls.some((sql) => sql.includes("GRANT SELECT, INSERT ON `elera_db_1`.*"))).toBe(true);
  expect(accounts.usernameFor(10)).toBe("elera_t_10");
});

test("flushes grants only when app-admin tokens exist", async () => {
  const calls = [];
  const accounts = createTokenSqlAccounts({
    query: async (sql) => {
      calls.push(sql);
      return sql.includes("FROM elera_meta.identities")
        ? [[{ physical_name: "elera_db", grants_json: [] }]]
        : [[]];
    },
  });
  await expect(accounts.grantApplicationDatabase("sample", "db")).resolves.toBe(0);
  expect(calls).toHaveLength(1);
  expect(() => createTokenSqlAccounts()).toThrow("query function is required");
  await accounts.create({
    tokenId: "11",
    token: "secret",
    application: "sample",
    identity: "worker",
  });
  expect(calls.some((sql) => sql.includes("FLUSH PRIVILEGES"))).toBe(true);
});

test("grants app admins access to each app database and revokes token accounts", async () => {
  const calls = [];
  const accounts = createTokenSqlAccounts({
    query: async (sql) => {
      calls.push(sql);
      return sql.includes("SELECT physical_name")
        ? [[{ physical_name: "elera_db_2" }]]
        : sql.includes("SELECT token_id")
          ? [[{ token_id: "123" }]]
          : [[]];
    },
  });
  await accounts.create({ tokenId: "123", token: "secret", application: "sample", admin: true });
  await accounts.grantApplicationDatabase("sample", "elera_db_2");
  await accounts.revoke("123");
  expect(calls.some((sql) => sql.includes("GRANT ALL PRIVILEGES ON `elera_db_2`.*"))).toBe(true);
  expect(calls.some((sql) => sql.includes("DROP USER IF EXISTS 'elera_t_123'"))).toBe(true);
});
