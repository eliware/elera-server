import { generate as generateSnowflake } from "@eliware/common";
import { identifier, literal } from "../../accounts/sql.mjs";
import { validateGrantPolicy } from "../../accounts/grant-policy.mjs";
import { validName, createPassword } from "./validation.mjs";

export function createManagedIdentityLifecycle({ query, q, box, createDatabase }) {
  return {
    async createIdentity({
      application,
      databaseName,
      identity,
      purpose = "runtime",
      grants = [],
    }) {
      validName(application, "application");
      validName(databaseName, "database");
      validName(identity, "identity");
      if (!["runtime", "readonly", "migration", "reporting", "admin"].includes(purpose))
        throw Object.assign(new Error("identity purpose is invalid"), { statusCode: 400 });
      if (!box) throw new Error("credential encryption is not configured");
      const username = `${application}_${identity}`;
      const secret = createPassword();
      const identityId = String(generateSnowflake());
      grants.forEach(validateGrantPolicy);
      const database = await createDatabase({ application, databaseName });
      await q(
        `INSERT INTO elera_meta.identities (identity_id, name, application_name, purpose, database_name, username, credential_ciphertext) VALUES (${literal(identityId)}, ${literal(identity)}, ${literal(application)}, ${literal(purpose)}, ${literal(database.physicalName)}, ${literal(username)}, ${literal(box.seal(secret))}) ON DUPLICATE KEY UPDATE purpose=VALUES(purpose), database_name=VALUES(database_name), credential_ciphertext=VALUES(credential_ciphertext), active=TRUE`,
      );
      await q(
        `INSERT INTO elera_meta.grants_policy (identity_name, application_name, grants_json) VALUES (${literal(identity)}, ${literal(application)}, ${literal(JSON.stringify(grants))}) ON DUPLICATE KEY UPDATE grants_json=VALUES(grants_json)`,
      );
      await query(
        `CREATE USER IF NOT EXISTS ${literal(username)}@'%' IDENTIFIED BY ${literal(secret)}`,
      );
      await query(`ALTER USER ${literal(username)}@'%' IDENTIFIED BY ${literal(secret)}`);
      await query(`REVOKE ALL PRIVILEGES, GRANT OPTION FROM ${literal(username)}@'%'`);
      for (const grant of grants)
        await query(
          `GRANT ${grant} ON ${identifier(database.physicalName)}.* TO ${literal(username)}@'%'`,
        );
      await query("FLUSH PRIVILEGES");
      return {
        application,
        database: databaseName,
        identity,
        purpose,
        username,
        password: secret,
        grants,
      };
    },
    async listIdentities(application) {
      const filter = application ? ` WHERE i.application_name = ${literal(application)}` : "";
      const [rows] = await q(
        `SELECT i.name, i.application_name AS application, i.purpose, d.name AS database, i.username, i.active, i.created_at, g.grants_json FROM elera_meta.identities i JOIN elera_meta.managed_databases d ON d.physical_name=i.database_name AND d.application_name=i.application_name LEFT JOIN elera_meta.grants_policy g ON g.identity_name = i.name AND g.application_name = i.application_name${filter} ORDER BY i.name`,
      );
      return rows.map(({ grants_json, ...row }) => ({
        ...row,
        grants: Array.isArray(grants_json) ? grants_json : JSON.parse(grants_json ?? "[]"),
      }));
    },
    async revokeIdentity(identity) {
      await q(`UPDATE elera_meta.identities SET active=FALSE WHERE name=${literal(identity)}`);
      return { identity, revoked: true };
    },
    async rotateIdentity(identity) {
      validName(identity, "identity");
      if (!box) throw new Error("credential encryption is not configured");
      const secret = createPassword();
      const [rows] = await q(
        `SELECT username FROM elera_meta.identities WHERE name=${literal(identity)} AND active=TRUE`,
      );
      const username = rows[0]?.username;
      if (!username) throw Object.assign(new Error("identity not found"), { statusCode: 404 });
      await q(
        `UPDATE elera_meta.identities SET credential_ciphertext=${literal(box.seal(secret))} WHERE name=${literal(identity)}`,
      );
      await query(`ALTER USER ${literal(username)}@'%' IDENTIFIED BY ${literal(secret)}`);
      await query("FLUSH PRIVILEGES");
      return { identity, username, password: secret, rotated: true };
    },
  };
}
