import { literal } from "../../accounts/sql.mjs";
import { validFqdn, validName } from "./validation.mjs";

export function createManagedCredentialLeases({ q, box, identity, tokenAccounts }) {
  return {
    async lease({
      identity: credentialIdentity,
      routes = {},
      nodeIdentity,
      ports,
      tokenId,
      sqlToken,
    }) {
      validName(credentialIdentity, "identity");
      if (!box) throw new Error("credential encryption is not configured");
      const runtimeNode = validFqdn(identity?.name, "runtime identity");
      if (nodeIdentity !== undefined && nodeIdentity !== runtimeNode)
        throw Object.assign(new Error("requested node identity does not match runtime identity"), {
          statusCode: 409,
        });
      const [rows] = await q(
        `SELECT i.application_name AS application, d.name AS database, d.physical_name AS physical_database, i.username, i.credential_ciphertext FROM elera_meta.identities i JOIN elera_meta.managed_databases d ON d.physical_name=i.database_name AND d.application_name=i.application_name WHERE i.name=${literal(credentialIdentity)} AND i.active=TRUE`,
      );
      const row = rows[0];
      if (!row) throw Object.assign(new Error("identity not found"), { statusCode: 404 });
      const primary = routes.primary ?? [{ host: runtimeNode, port: 3306, nodeId: runtimeNode }];
      for (const route of [...primary, ...(routes.balanced ?? primary)]) {
        validFqdn(route?.host, "lease route host");
        validFqdn(route?.nodeId, "lease route node");
      }
      return {
        application: row.application,
        database: row.database,
        physicalDatabase: row.physical_database,
        identity: credentialIdentity,
        username: tokenId ? tokenAccounts.usernameFor(tokenId) : row.username,
        password: tokenId ? sqlToken : box.open(row.credential_ciphertext),
        routes: { primary, balanced: routes.balanced ?? primary },
        nodeIdentity: runtimeNode,
        ports,
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      };
    },
  };
}
