import { isQuorumReady } from "./cluster/quorum-readiness.mjs";
export { calculateWeight } from "./health/weight.mjs";

export function createHealthService({
  db,
  timeoutMs,
  log,
  elera = true,
  clusterSize = 1,
  getTelemetry = () => undefined,
  getRecoveryState = () => undefined,
}) {
  let cached;
  let expiresAt = 0;
  let inFlight;
  async function fetchStatus() {
    if (!db) throw new Error("database pool is unavailable");
    // A startup check may quarantine the pool before MariaDB begins accepting
    // connections. Health checks can restore that pool.
    await db.health?.();
    const statusQuery =
      "SHOW GLOBAL STATUS WHERE Variable_name IN (" +
      "'wsrep_cluster_state_uuid','wsrep_local_state_comment','wsrep_rea" +
      "dy','wsrep_cluster_status','wsrep_cluster_si" +
      "ze','wsrep_local_recv_queue','wsrep_local_send_queue','wsrep_flow_control_paused')";
    const result = await Promise.race([
      db.query(statusQuery),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("status query timeout")), timeoutMs),
      ),
    ]);
    if (!Array.isArray(result) || !Array.isArray(result[0]))
      throw new Error("status query returned invalid result");
    const [rows] = result;
    const values = Object.fromEntries(rows.map((row) => [row.Variable_name, row.Value]));
    const recovery = getRecoveryState();
    const galeraReady =
      values.wsrep_local_state_comment === "Synced" &&
      values.wsrep_ready === "ON" &&
      values.wsrep_cluster_status === "Primary";
    // A prior join timeout must not permanently hide a later Galera convergence.
    const recoveryBlocked =
      recovery &&
      !galeraReady &&
      [
        "cluster-unavailable",
        "blocked-ambiguous",
        "awaiting-quorum",
        "recovery-authorized",
        "bootstrapping",
        "joining",
        "collecting-evidence",
        "pending",
      ].includes(recovery.state);
    const explicitBootstrap =
      recovery?.state === "complete" && recovery.reason?.startsWith("explicit bootstrap");
    const ready =
      !elera ||
      (!recoveryBlocked &&
        galeraReady &&
        isQuorumReady(values, { expectedSize: explicitBootstrap ? 1 : clusterSize }));
    log.debug("Elera status checked", {
      ready,
      state: values.wsrep_local_state_comment,
      wsrepReady: values.wsrep_ready,
      clusterStatus: values.wsrep_cluster_status,
    });
    return { values, ready, recovery, telemetry: getTelemetry() };
  }
  return {
    status() {
      if (cached && Date.now() < expiresAt) return Promise.resolve(cached);
      if (inFlight) return inFlight;
      inFlight = fetchStatus()
        .then((result) => {
          cached = result;
          expiresAt = Date.now() + 1000;
          return result;
        })
        .finally(() => {
          inFlight = undefined;
        });
      return inFlight;
    },
    cacheInfo() {
      return { cached: Boolean(cached), expiresAt };
    },
  };
}
