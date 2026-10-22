import { createManagedAccounts } from "../../accounts/managed.mjs";
import { exportAccounts, importAccounts } from "./account-transfer.mjs";
import { sendAccountResponse } from "./accounts-response.mjs";
import { readBody } from "../http.mjs";

const send = sendAccountResponse;

export async function handleAccountRoute({ method, path, request, response, db, auth }) {
  if (!db || !auth) return false;
  const managed = createManagedAccounts({ query: (...args) => db.query(...args) });
  if (method === "GET" && path === "/api/v1/accounts") {
    if (!allowed(auth, "account:read")) return false;
    const [rows] = await db.query(
      "SELECT User, Host, plugin FROM mysql.user WHERE User NOT IN ('mariadb.sys','mysql','root') ORDER BY User, Host",
    );
    send(response, 200, { ok: true, accounts: rows });
    return true;
  }
  if (method === "POST" && path === "/api/v1/accounts/export") {
    if (!allowed(auth, "account:read")) return false;
    send(response, 200, { ok: true, accounts: await exportAccounts(db) });
    return true;
  }
  if (method === "POST" && path === "/api/v1/accounts/import") {
    if (!allowed(auth, "account:provision")) return false;
    send(response, 200, await importAccounts(request, db));
    return true;
  }
  if (method === "POST" && path === "/api/v1/accounts/provision") {
    if (!allowed(auth, "account:provision")) return false;
    const body = await readBody(request);
    send(response, 200, {
      ok: true,
      operation: "account.provision",
      data: await managed.provision(body),
    });
    return true;
  }
  if (method === "POST" && path === "/api/v1/accounts/revoke") {
    if (!allowed(auth, "account:revoke")) return false;
    const body = await readBody(request);
    send(response, 200, {
      ok: true,
      operation: "account.revoke",
      data: await managed.revoke(body),
    });
    return true;
  }
  if (method === "POST" && path === "/api/v1/accounts/verify") {
    if (!allowed(auth, "account:read")) return false;
    const body = await readBody(request);
    const data = await managed.verify(body);
    send(response, data.verified ? 200 : 503, {
      ok: data.verified,
      operation: "account.verify",
      data,
    });
    return true;
  }
  return false;
}

function allowed(auth, scope) {
  return auth?.root || auth?.scopes?.includes("*") || auth?.scopes?.includes(scope);
}
