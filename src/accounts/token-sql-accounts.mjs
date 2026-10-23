import { identifier, literal } from "./sql.mjs";
import { validateGrantPolicy } from "./grant-policy.mjs";
import { createPassword } from "../metadata/managed/validation.mjs";

const ROOT_TOKEN_ID = "root";
const usernameFor = (tokenId) => `elera_t_${String(tokenId)}`;
const readOnlyGrants = new Set(["SELECT", "SHOW VIEW", "LOCK TABLES"]);
const parseValues = (value) => (Array.isArray(value) ? value : JSON.parse(value ?? "[]"));

export function createTokenSqlAccounts({ query, q = query, box } = {}) {
  if (typeof query !== "function" || typeof q !== "function")
    throw new TypeError("query functions are required");
  const requireBox = () => {
    if (!box) throw new Error("credential encryption is not configured");
  };
  const accountName = (username) => `${literal(username)}@'%'`;

  async function saveCredential(tokenId, username, password) {
    await q(
      `INSERT INTO elera_meta.sql_accounts (token_id, username, credential_ciphertext) VALUES (${literal(tokenId)}, ${literal(username)}, ${literal(box.seal(password))}) ON DUPLICATE KEY UPDATE username=VALUES(username), credential_ciphertext=VALUES(credential_ciphertext)`,
    );
  }

  async function setAccount(username, password) {
    const account = accountName(username);
    await query(`CREATE USER IF NOT EXISTS ${account} IDENTIFIED BY ${literal(password)}`);
    await query(`ALTER USER ${account} IDENTIFIED BY ${literal(password)}`);
    await query(`REVOKE ALL PRIVILEGES, GRANT OPTION FROM ${account}`);
  }

  return {
    usernameFor,
    async ensureRoot() {
      requireBox();
      const [rows] = await q(
        `SELECT username, credential_ciphertext FROM elera_meta.sql_accounts WHERE token_id=${literal(ROOT_TOKEN_ID)}`,
      );
      const username = rows[0]?.username ?? "elera_root";
      const password = rows[0] ? box.open(rows[0].credential_ciphertext) : createPassword();
      await saveCredential(ROOT_TOKEN_ID, username, password);
      await setAccount(username, password);
      await query(`GRANT ALL PRIVILEGES ON *.* TO ${accountName(username)} WITH GRANT OPTION`);
      await query("FLUSH PRIVILEGES");
      return { username, host: "%", grants: ["ALL PRIVILEGES ON *.* WITH GRANT OPTION"] };
    },
    async create({ tokenId, application, identity, scopes = [], admin = false }) {
      requireBox();
      const username = usernameFor(tokenId);
      const password = createPassword();
      const account = accountName(username);
      await setAccount(username, password);
      await saveCredential(String(tokenId), username, password);
      const [rows] = admin
        ? await q(
            `SELECT physical_name FROM elera_meta.managed_databases WHERE application_name=${literal(application)}`,
          )
        : identity
          ? await q(
              `SELECT d.physical_name, g.grants_json FROM elera_meta.identities i JOIN elera_meta.managed_databases d ON d.physical_name=i.database_name AND d.application_name=i.application_name LEFT JOIN elera_meta.grants_policy g ON g.identity_name=i.name AND g.application_name=i.application_name WHERE i.name=${literal(identity)} AND i.application_name=${literal(application)} AND i.active=TRUE`,
            )
          : [[]];
      for (const row of rows) {
        const configured = parseValues(row.grants_json).flatMap((grant) =>
          String(grant)
            .split(",")
            .map((privilege) => privilege.trim())
            .filter(Boolean),
        );
        const grants = scopes.includes("database:write")
          ? configured
          : scopes.includes("database:read")
            ? configured.filter((grant) => readOnlyGrants.has(grant.toUpperCase()))
            : [];
        if (admin)
          await query(`GRANT ALL PRIVILEGES ON ${identifier(row.physical_name)}.* TO ${account}`);
        else if (grants.length) {
          grants.forEach(validateGrantPolicy);
          await query(
            `GRANT ${grants.join(", ")} ON ${identifier(row.physical_name)}.* TO ${account}`,
          );
        }
      }
      await query("FLUSH PRIVILEGES");
      return { tokenId: String(tokenId), username, host: "%" };
    },
    async grantApplicationDatabase(application, database) {
      const [rows] = await q(
        `SELECT t.token_id FROM elera_meta.scoped_tokens t WHERE t.application_name=${literal(application)} AND t.identity_name IS NULL AND t.active=TRUE`,
      );
      for (const row of rows)
        await query(
          `GRANT ALL PRIVILEGES ON ${identifier(database)}.* TO ${accountName(usernameFor(row.token_id))}`,
        );
      if (rows.length) await query("FLUSH PRIVILEGES");
      return rows.length;
    },
    async credentials({ tokenId, root = false } = {}) {
      requireBox();
      const id = root ? ROOT_TOKEN_ID : String(tokenId ?? "");
      const [rows] = await q(
        `SELECT username, credential_ciphertext FROM elera_meta.sql_accounts WHERE token_id=${literal(id)}`,
      );
      if (!rows[0])
        throw Object.assign(new Error("token SQL account is unavailable"), { statusCode: 403 });
      return { username: rows[0].username, password: box.open(rows[0].credential_ciphertext) };
    },
    async revoke(tokenId) {
      const username = usernameFor(tokenId);
      await query(`DROP USER IF EXISTS ${accountName(username)}`);
      await q(`DELETE FROM elera_meta.sql_accounts WHERE token_id=${literal(tokenId)}`);
      await query("FLUSH PRIVILEGES");
    },
  };
}
