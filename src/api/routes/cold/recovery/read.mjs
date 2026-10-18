const allowed = (auth) =>
  auth?.root || auth?.scopes?.includes("*") || auth?.scopes?.includes("recovery:read");

export async function handleColdRecoveryReadRoute({ method, path, response, protocol, auth } = {}) {
  if (!allowed(auth)) return false;
  const routes = {
    "/api/v1/cluster/cold-recovery/evidence": ["evidence", "cluster.cold-recovery.evidence"],
    "/api/v1/cluster/cold-recovery/status": ["status", "cluster.cold-recovery.status"],
    "/api/v1/cluster/cold-recovery/plan": ["plan", "cluster.cold-recovery.plan"],
  };
  const operation = routes[path];
  const expectedMethod = path.endsWith("/plan") ? "POST" : "GET";
  if (!operation || method !== expectedMethod) return false;
  response.json(200, { ok: true, operation: operation[1], data: await protocol[operation[0]]() });
  return true;
}
