import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadIntent, validateIntent } from "./intent/model.mjs";
import { runtimeIdentity } from "./runtime/identity.mjs";
import { clientDrainTimeout } from "./lifecycle/drain/policy.mjs";
export { mariaDbArguments } from "./config/mariadb-arguments.mjs";
const persistedIntent = (environment) => {
  try {
    return JSON.parse(
      readFileSync(
        join(
          environment.ELERA_CONFIG_STATE_DIR ??
            `${environment.MARIADB_DATA_DIR ?? "/var/lib/mysql"}/elera-state`,
          "active.intent.json",
        ),
        "utf8",
      ),
    );
  } catch {
    return undefined;
  }
};

export function loadSupervisorConfig(
  environment = process.env,
  intent = undefined,
  identity = undefined,
  identityProvider = runtimeIdentity,
) {
  identity ??= identityProvider();
  if (!identity?.name) throw new Error("runtime identity is required for supervisor configuration");
  intent ??= persistedIntent(environment) ?? loadIntent(environment, identity);
  validateIntent(intent);
  const members = intent.cluster.members;
  const localMembers = members.filter((member) => member.name === identity.name);
  if (localMembers.length !== 1) {
    throw Object.assign(
      new Error(
        `runtime hostname ${identity.name} must match exactly one configured cluster member. Expected configured members: ${members.map((member) => member.name).join(", ")}`,
      ),
      { code: "RUNTIME_IDENTITY_MEMBERSHIP_MISMATCH", statusCode: 400 },
    );
  }
  const number = (name, fallback) => {
    const value = Number(environment[name] ?? fallback);
    if (!Number.isInteger(value) || value < 1 || value > 65535)
      throw new Error(`${name} must be a valid TCP port`);
    return value;
  };
  return Object.freeze({
    httpPort: number("ELERA_HTTP_PORT", 8080),
    clusterSize: intent.cluster.members.length,
    timeoutMs: Number(environment.ELERA_QUERY_TIMEOUT_MS ?? 5000),
    drainTimeoutMs: clientDrainTimeout(environment.ELERA_DRAIN_TIMEOUT_MS ?? 45000),
    shutdownTimeoutMs: Number(environment.ELERA_SHUTDOWN_TIMEOUT_MS ?? 60000),
    startupTimeoutMs: Number(environment.ELERA_STARTUP_TIMEOUT_MS ?? 30000),
    dataDir: intent?.mariadb?.dataDir ?? environment.MARIADB_DATA_DIR ?? "/var/lib/mysql",
    elera: intent.cluster.members.length > 1,
    intent,
    runtimeIdentity: identity,
    environment,
  });
}
