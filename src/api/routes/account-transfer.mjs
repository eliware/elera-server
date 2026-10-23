import { accountName, literal } from "../../accounts/sql.mjs";
import { readBody } from "../http.mjs";

const safeGrant = (value) =>
  String(value ?? "")
    .replace(/\s+IDENTIFIED\s+BY\s+PASSWORD\s+'[^']*'/gi, "")
    .replace(/\s+IDENTIFIED\s+BY\s+'[^']*'/gi, "")
    .trim();

export async function exportAccounts(db) {
  const [rows] = await db.query(
    "SELECT User, Host FROM mysql.user WHERE User NOT IN ('mariadb.sys','mysql','root') ORDER BY User, Host",
  );
  const accounts = [];
  for (const row of rows) {
    const [definitions] = await db.query("SHOW CREATE USER ??@??", [row.User, row.Host]);
    const [grants] = await db
      .query("SHOW GRANTS FOR ??@??", [row.User, row.Host])
      .catch(() => [[]]);
    accounts.push({
      user: row.User,
      host: row.Host,
      createUser: Object.values(definitions[0] ?? {}).find((value) =>
        String(value).startsWith("CREATE USER "),
      ),
      grants: grants.map((grant) => safeGrant(Object.values(grant)[0])).filter(Boolean),
    });
  }
  return accounts;
}

export async function importAccounts(request, db) {
  const body = await readBody(request);
  if (body.confirm !== true)
    throw Object.assign(new Error("account import requires confirm: true"), { statusCode: 409 });
  const accounts = body.accounts ?? [];
  for (const account of accounts) {
    const user = accountName(account.user);
    const host = String(account.host ?? "%");
    if (account.createUser) {
      const quoted = `CREATE USER ${literal(user)}@${literal(host)} `;
      const identified = `CREATE USER \`${user.replaceAll("`", "``")}\`@\`${host.replaceAll("`", "``")}\` `;
      if (
        (!account.createUser.startsWith(quoted) && !account.createUser.startsWith(identified)) ||
        /;|--|\/\*/.test(account.createUser)
      )
        throw Object.assign(new Error("invalid user definition"), { statusCode: 400 });
      await db.query(account.createUser.replace(/^CREATE USER/i, "CREATE OR REPLACE USER"));
    } else await db.query(`CREATE USER IF NOT EXISTS ${literal(user)}@${literal(host)}`);
    for (const grant of account.grants ?? []) {
      if (typeof grant !== "string" || !/^GRANT\s+/i.test(grant) || /;|--|\/\*/.test(grant))
        throw Object.assign(new Error("invalid grant statement"), { statusCode: 400 });
      await db.query(grant);
    }
  }
  return {
    ok: true,
    operation: "accounts.import",
    changed: true,
    status: "completed",
    count: accounts.length,
  };
}
