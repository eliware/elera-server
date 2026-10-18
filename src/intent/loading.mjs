import { validateIntent } from "./model.mjs";

export function defaultIntent(environment = process.env, identity) {
  if (!identity?.name)
    throw new Error("shared runtime identity is required to create the default supervisor intent");
  const host = identity.name;
  return {
    apiVersion: "elera.eliware.dev/v1alpha1",
    kind: "SupervisorIntent",
    cluster: { name: "local-elera", members: [{ name: host, address: host, port: 3306 }] },
    mariadb: {
      port: 3306,
      dataDir: environment.MARIADB_DATA_DIR ?? "/var/lib/mysql",
      binlogFormat: "ROW",
    },
    routing: { healthIntervalMs: 1000, weights: {} },
    drain: {
      queryTimeoutMs: Number(environment.ELERA_QUERY_TIMEOUT_MS ?? 5000),
      drainTimeoutMs: Number(environment.ELERA_DRAIN_TIMEOUT_MS ?? 45000),
      shutdownTimeoutMs: Number(environment.ELERA_SHUTDOWN_TIMEOUT_MS ?? 60000),
    },
  };
}

export function loadIntent(environment = process.env, identity) {
  if (!environment.SUPERVISOR_INTENT_JSON)
    return validateIntent(defaultIntent(environment, identity));
  try {
    return validateIntent(JSON.parse(environment.SUPERVISOR_INTENT_JSON));
  } catch (error) {
    if (error.code === "INVALID_INTENT") throw error;
    throw Object.assign(new Error(`invalid SUPERVISOR_INTENT_JSON: ${error.message}`), {
      statusCode: 400,
      code: "INVALID_INTENT",
    });
  }
}
