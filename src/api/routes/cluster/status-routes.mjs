import { bootstrapEligibility } from "../../../cluster/bootstrap-eligibility.mjs";

export async function handleClusterStatusRoute({
  method,
  path,
  url,
  response,
  getStatus,
  enabled,
}) {
  if (method === "GET" && path === "/api/v1/cluster/status") {
    response.json(200, {
      ok: true,
      operation: "cluster.status",
      status: "completed",
      data: await getStatus(),
    });
    return true;
  }
  if (method === "GET" && path === "/api/v1/cluster/bootstrap/eligibility") {
    const data = await getStatus();
    const decision = bootstrapEligibility({
      enabled,
      ready: data.ready,
      state: data.values?.wsrep_local_state_comment,
    });
    response.json(200, { ok: true, ...decision, data });
    return true;
  }
  if (method === "POST" && path === "/api/v1/cluster/bootstrap/plan") {
    const data = await getStatus();
    response.json(200, {
      ok: true,
      operation: "cluster.bootstrap",
      changed: false,
      status: "planned",
      eligible: enabled && !data.ready,
      data,
    });
    return true;
  }
  if (method !== "GET" || path !== "/api/v1/cluster/wait-ready") return false;
  const rawTimeout = url.searchParams.get("timeoutMs");
  const timeoutMs = rawTimeout === null ? 60000 : Number(rawTimeout);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 0)
    throw Object.assign(new Error("timeoutMs must be a non-negative integer"), { statusCode: 400 });
  const deadline = Date.now() + Math.min(timeoutMs, 300000);
  let data;
  do {
    data = await getStatus().catch(() => ({ ready: false }));
    if (data.ready) {
      response.json(200, { ok: true, operation: "cluster.wait-ready", status: "ready", data });
      return true;
    }
    if (Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, Math.min(1000, deadline - Date.now())));
  } while (Date.now() < deadline);
  response.json(408, { ok: false, operation: "cluster.wait-ready", status: "timeout", data });
  return true;
}
