import { identifier, literal } from "./sql.mjs";

const usernameFor = (tokenId) => `elera_t_${String(tokenId)}`;
const values = (input) => (Array.isArray(input) ? input : JSON.parse(input ?? "[]"));
const readOnly = new Set(["SELECT", "SHOW VIEW", "LOCK TABLES"]);

export function createTokenSqlAccounts({ query } = {}) {
  if (typeof query !== "function") throw new TypeError("query function is required");
  return {
    usernameFor,
    async create({ tokenId, token, application, identity, scopes = [], admin = false }) {
      const username = usernameFor(tokenId);
      const account = `${literal(username)}@'%'`;
      await query(`CREATE USER IF NOT EXISTS ${account} IDENTIFIED BY ${literal(token)}`);
      await query(`ALTER USER ${account} IDENTIFIED BY ${literal(token)}`);
      await query(`REVOKE ALL PRIVILEGES, GRANT OPTION FROM ${account}`);
      const [rows] = admin
        ? await query(
            `SELECT physical_name FROM elera_meta.managed_databases WHERE application_name=${literal(application)}`,
          )
        : identity
          ? await query(
              `SELECT d.physical_name, g.grants_json FROM elera_meta.identities i JOIN elera_meta.managed_databases d ON d.physical_name=i.database_name AND d.application_name=i.application_name LEFT JOIN elera_meta.grants_policy g ON g.identity_name=i.name AND g.application_name=i.application_name WHERE i.name=${literal(identity)} AND i.application_name=${literal(application)} AND i.active=TRUE`,
            )
          : [[]];
      for (const row of rows) {
        const grants = values(row.grants_json);
        const permitted = scopes.includes("database:write")
          ? grants
          : scopes.includes("database:read")
            ? grants.filter((grant) => readOnly.has(grant))
            : [];
        if (admin || permitted.length)
          await query(
            `GRANT ${admin ? "ALL PRIVILEGES" : permitted.join(", ")} ON ${identifier(row.physical_name)}.* TO ${account}`,
          );
      }
      await query("FLUSH PRIVILEGES");
      return { username, host: "%" };
    },
    async grantApplicationDatabase(application, database) {
      const [rows] = await query(
        `SELECT token_id FROM elera_meta.scoped_tokens WHERE application_name=${literal(application)} AND identity_name IS NULL AND active=TRUE`,
      );
      for (const row of rows)
        await query(
          `GRANT ALL PRIVILEGES ON ${identifier(database)}.* TO ${literal(usernameFor(row.token_id))}@'%'`,
        );
      if (rows.length) await query("FLUSH PRIVILEGES");
      return rows.length;
    },
    async revoke(tokenId) {
      await query(`DROP USER IF EXISTS ${literal(usernameFor(tokenId))}@'%'`);
    },
  };
}
