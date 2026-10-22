export function handlePendingColdRecoveryRoute({ method, path, response, authorized }) {
  if (!path.startsWith("/api/v1/cluster/cold-recovery/")) return false;
  if (!authorized) return false;
  if (method === "POST" && path === "/api/v1/cluster/cold-recovery/plan") {
    response.json(200, {
      ok: true,
      operation: "cluster.cold-recovery.plan",
      data: {
        eligible: false,
        mode: "blocked",
        reason: "recovery protocol is still initializing",
      },
    });
    return true;
  }
  response.json(503, {
    ok: false,
    operation: "cluster.cold-recovery",
    error: "recovery unavailable",
    code: "RECOVERY_UNAVAILABLE",
  });
  return true;
}
