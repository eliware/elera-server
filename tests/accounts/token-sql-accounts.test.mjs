import { expect, jest, test } from "@jest/globals";
import { createSecretBox } from "../../src/metadata/secret-box.mjs";
import { createTokenSqlAccounts } from "../../src/accounts/token-sql-accounts.mjs";

test("creates and resolves a persistent root SQL account with encrypted credentials", async () => {
  const box = createSecretBox("test-key");
  const calls = [];
  let saved;
  const q = jest.fn(async (sql) => {
    calls.push(sql);
    if (sql.includes("SELECT username, credential_ciphertext")) return [saved ? [saved] : []];
    if (sql.includes("INSERT INTO elera_meta.sql_accounts")) {
      const [, tokenId, username, ciphertext] = sql.match(
        /VALUES \('([^']+)', '([^']+)', '([^']+)'\)/,
      );
      saved = { tokenId, username, credential_ciphertext: ciphertext };
    }
    return [[]];
  });
  const query = jest.fn(async (sql) => {
    calls.push(sql);
    return [[]];
  });
  const accounts = createTokenSqlAccounts({ query, q, box });
  await accounts.ensureRoot();
  const credentials = await accounts.credentials({ root: true });
  await accounts.ensureRoot();
  expect(credentials.username).toBe("elera_root");
  expect(credentials.password).toBeTruthy();
  expect(box.open(saved.credential_ciphertext)).toBe(credentials.password);
  expect(calls.some((sql) => sql.includes("GRANT ALL PRIVILEGES ON *.*"))).toBe(true);
  expect(calls.some((sql) => sql.includes("GRANT PROXY ON ''@'%'"))).toBe(true);
  expect(calls.some((sql) => sql.includes("WITH GRANT OPTION"))).toBe(true);
});

test("creates app-admin accounts and expands their grants as app databases appear", async () => {
  const calls = [];
  const q = jest.fn(async (sql) => {
    calls.push(sql);
    if (sql.includes("SELECT physical_name"))
      return [[{ physical_name: "elera_db_1" }, { physical_name: "elera_db_2" }]];
    if (sql.includes("SELECT t.token_id"))
      return sql.includes("'other'") ? [[]] : [[{ token_id: "42" }]];
    return [[]];
  });
  const query = jest.fn(async (sql) => {
    calls.push(sql);
    return [[]];
  });
  const accounts = createTokenSqlAccounts({ query, q, box: createSecretBox("test-key") });
  await accounts.create({ tokenId: "42", application: "payments", admin: true });
  await accounts.grantApplicationDatabase("payments", "elera_db_3");
  await accounts.grantApplicationDatabase("other", "elera_db_4");
  expect(calls.filter((sql) => sql.includes("GRANT ALL PRIVILEGES ON `elera_db_"))).toHaveLength(3);
  expect(calls.some((sql) => sql.includes("elera_t_42"))).toBe(true);
});

test("limits scoped token grants to the identity policy and token access level", async () => {
  const calls = [];
  const q = jest.fn(async (sql) => {
    calls.push(sql);
    if (sql.includes("SELECT d.physical_name"))
      return [
        [
          {
            physical_name: "elera_db_7",
            grants_json: sql.includes("writer")
              ? ["SELECT, INSERT, UPDATE"]
              : '["SELECT, INSERT, UPDATE"]',
          },
        ],
      ];
    return [[]];
  });
  const query = jest.fn(async (sql) => {
    calls.push(sql);
    return [[]];
  });
  const accounts = createTokenSqlAccounts({ query, q, box: createSecretBox("test-key") });
  await accounts.create({
    tokenId: "70",
    application: "payments",
    identity: "reader",
    scopes: ["database:read"],
  });
  expect(calls.some((sql) => sql.includes("GRANT SELECT ON `elera_db_7`"))).toBe(true);
  expect(calls.some((sql) => sql.includes("GRANT INSERT"))).toBe(false);
  calls.length = 0;
  await accounts.create({
    tokenId: "71",
    application: "payments",
    identity: "writer",
    scopes: ["database:write"],
  });
  expect(calls.some((sql) => sql.includes("GRANT SELECT, INSERT, UPDATE ON `elera_db_7`"))).toBe(
    true,
  );
  calls.length = 0;
  await accounts.create({ tokenId: "72", application: "payments", identity: "none" });
  expect(calls.some((sql) => sql.startsWith("GRANT "))).toBe(false);
  calls.length = 0;
  await accounts.create({ tokenId: "73", application: "payments" });
  expect(calls.some((sql) => sql.startsWith("GRANT "))).toBe(false);
});

test("reads encrypted account credentials and removes revoked MariaDB accounts", async () => {
  const box = createSecretBox("test-key");
  const calls = [];
  const q = jest.fn(async (sql) => {
    calls.push(sql);
    if (sql.includes("SELECT username, credential_ciphertext") && !sql.includes("'missing'"))
      return [[{ username: "elera_t_55", credential_ciphertext: box.seal("persistent-secret") }]];
    if (sql.includes("DELETE FROM elera_meta.sql_accounts")) return [[]];
    return [[]];
  });
  const query = jest.fn(async (sql) => {
    calls.push(sql);
    return [[]];
  });
  const accounts = createTokenSqlAccounts({ query, q, box });
  await expect(accounts.credentials({ tokenId: "55" })).resolves.toEqual({
    username: "elera_t_55",
    password: "persistent-secret",
  });
  await accounts.revoke("55");
  expect(calls.some((sql) => sql.includes("DROP USER IF EXISTS 'elera_t_55'@'%'"))).toBe(true);
  expect(calls.some((sql) => sql.includes("DELETE FROM elera_meta.sql_accounts"))).toBe(true);
  await expect(accounts.credentials({ tokenId: "missing" })).rejects.toMatchObject({
    statusCode: 403,
  });
});

test("requires the configured credential encryption key", async () => {
  const accounts = createTokenSqlAccounts({ query: async () => [[]] });
  await expect(accounts.ensureRoot()).rejects.toThrow("credential encryption is not configured");
});

test("covers default metadata query wiring and rejects incomplete dependencies", async () => {
  const query = jest.fn(async (sql) => {
    if (sql.includes("SELECT username, credential_ciphertext")) return [[]];
    return [[]];
  });
  const accounts = createTokenSqlAccounts({ query, box: createSecretBox("test-key") });
  await expect(accounts.credentials()).rejects.toMatchObject({ statusCode: 403 });
  expect(() => createTokenSqlAccounts()).toThrow("query functions are required");
  expect(() => createTokenSqlAccounts({ query: async () => [[]], q: null })).toThrow(
    "query functions are required",
  );
});
