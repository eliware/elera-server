import { generate as generateSnowflake } from "@eliware/common";
import { literal } from "../../accounts/sql.mjs";
import { tokenMatchesHash } from "../token-authentication.mjs";
import { validName, hashToken, createToken } from "./validation.mjs";

export function createManagedTokenLifecycle({ q, tokenAccounts }) {
  return {
    async issueToken({ tokenName, application, identity, scopes = [] }) {
      validName(tokenName, "token");
      validName(application, "application");
      validName(identity, "identity");
      const [rows] = await q(
        `SELECT i.application_name AS application, d.name AS database FROM elera_meta.identities i JOIN elera_meta.managed_databases d ON d.physical_name=i.database_name AND d.application_name=i.application_name WHERE i.name=${literal(identity)} AND i.application_name=${literal(application)} AND i.active=TRUE`,
      );
      const owner = rows[0];
      if (!owner) throw Object.assign(new Error("identity not found"), { statusCode: 404 });
      if (owner.application !== application)
        throw Object.assign(new Error("identity does not belong to application"), {
          statusCode: 400,
        });
      const secret = createToken();
      const [existing] = await q(
        `SELECT token_id FROM elera_meta.scoped_tokens WHERE name=${literal(tokenName)} AND application_name=${literal(application)}`,
      );
      const tokenId = existing[0]?.token_id ?? String(generateSnowflake());
      await q(
        `INSERT INTO elera_meta.scoped_tokens (name, token_hash, application_name, identity_name, scopes_json, token_id) VALUES (${literal(tokenName)}, ${literal(hashToken(secret))}, ${literal(application)}, ${literal(identity)}, ${literal(JSON.stringify(scopes))}, ${literal(tokenId)}) ON DUPLICATE KEY UPDATE token_hash=VALUES(token_hash), active=TRUE, rotated_at=CURRENT_TIMESTAMP`,
      );
      await tokenAccounts?.create({ tokenId, application, identity, scopes });
      return {
        name: tokenName,
        token: secret,
        application,
        database: owner.database,
        identity,
        scopes,
      };
    },
    async revokeToken({ tokenName, application } = {}) {
      validName(tokenName, "token");
      validName(application, "application");
      const [rows] = await q(
        `SELECT token_id FROM elera_meta.scoped_tokens WHERE name=${literal(tokenName)} AND application_name=${literal(application)}`,
      );
      await q(
        `UPDATE elera_meta.scoped_tokens SET active=FALSE WHERE name=${literal(tokenName)} AND application_name=${literal(application)}`,
      );
      if (rows[0]) await tokenAccounts?.revoke(rows[0].token_id);
      return { name: tokenName, application, revoked: true };
    },
    async authenticate(token) {
      if (!token) return null;
      const [rows] = await q(
        `SELECT t.token_id AS tokenId, t.name, t.application_name AS application, d.name AS database, d.physical_name AS physical_database, t.identity_name AS identity, t.token_hash, t.scopes_json FROM elera_meta.scoped_tokens t LEFT JOIN elera_meta.identities i ON i.name=t.identity_name AND i.application_name=t.application_name LEFT JOIN elera_meta.managed_databases d ON d.physical_name=i.database_name AND d.application_name=i.application_name WHERE t.active=TRUE AND (t.identity_name IS NULL OR i.active=TRUE) AND t.token_hash=${literal(hashToken(token))}`,
      );
      const row = rows.find((candidate) => tokenMatchesHash(token, candidate.token_hash));
      if (!row) return null;
      const {
        token_hash: _tokenHash,
        scopes_json: scopesJson,
        physical_database: physicalDatabase,
        ...metadata
      } = row;
      return {
        ...metadata,
        ...(physicalDatabase ? { physicalDatabase } : {}),
        scopes: Array.isArray(scopesJson) ? scopesJson : JSON.parse(scopesJson ?? "[]"),
      };
    },
  };
}
