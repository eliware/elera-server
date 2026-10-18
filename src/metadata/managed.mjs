import { createSecretBox } from "./secret-box.mjs";
import { validFqdn } from "./managed/validation.mjs";
import { createManagedDatabaseCatalog } from "./managed/database-catalog.mjs";
import { createManagedIdentityLifecycle } from "./managed/identity-lifecycle.mjs";
import { createManagedCredentialLeases } from "./managed/credential-leases.mjs";
import { createManagedTokenLifecycle } from "./managed/token-lifecycle.mjs";

export function createManagedMetadata({
  query,
  identity,
  database = "elera_meta",
  credentialKey = process.env.ELERA_CREDENTIAL_KEY,
} = {}) {
  if (typeof query !== "function") throw new TypeError("query function is required");
  if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(database))
    throw new TypeError("metadata database name is invalid");
  validFqdn(identity?.name, "runtime identity");
  const q = (sql, params) => query(sql.replaceAll("elera_meta", `\`${database}\``), params);
  const box = credentialKey ? createSecretBox(credentialKey) : null;
  const catalog = createManagedDatabaseCatalog({ query, q });
  const identities = createManagedIdentityLifecycle({
    query,
    q,
    box,
    createDatabase: catalog.createDatabase,
  });
  const leases = createManagedCredentialLeases({ q, box, identity });
  const tokens = createManagedTokenLifecycle({ q });
  return { ...catalog, ...identities, ...leases, ...tokens };
}
