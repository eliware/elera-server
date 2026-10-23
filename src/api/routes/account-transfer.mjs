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
    const [grants] = await db
      .query("SHOW GRANTS FOR ??@??", [row.User, row.Host])
      .catch(() => [[]]);
    accounts.push({
      user: row.User,
      host: row.Host,
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
    await db.query(`CREATE USER IF NOT EXISTS ${literal(user)}@${literal(host)}`);
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
