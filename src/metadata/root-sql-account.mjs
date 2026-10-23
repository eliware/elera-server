import { literal } from "../accounts/sql.mjs";

export const ROOT_SQL_USERNAME = "elera_root";

export async function ensureRootSqlAccount({ query, token, username = ROOT_SQL_USERNAME }) {
  if (typeof query !== "function") throw new TypeError("query function is required");
  if (typeof token !== "string" || token.length === 0)
    throw new TypeError("root token is required");
  const account = `${literal(username)}@'%'`;
  await query(`CREATE USER IF NOT EXISTS ${account} IDENTIFIED BY ${literal(token)}`);
  await query(`ALTER USER ${account} IDENTIFIED BY ${literal(token)}`);
  await query(`GRANT ALL PRIVILEGES ON *.* TO ${account} WITH GRANT OPTION`);
  await query("FLUSH PRIVILEGES");
  return { username, host: "%", grants: ["ALL PRIVILEGES ON *.* WITH GRANT OPTION"] };
}
