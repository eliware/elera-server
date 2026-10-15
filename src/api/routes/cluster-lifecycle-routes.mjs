import { readBody } from "../http.mjs";
import { planLifecycle } from "../../cluster/lifecycle-plan.mjs";

export async function handleClusterLifecycleRoute({
  method,
  path,
  request,
  response,
  getStatus,
  lifecycle,
  enabled,
  nodeId,
}) {
  if (
    method !== "POST" ||
    !["/api/v1/cluster/lifecycle/plan", "/api/v1/cluster/lifecycle/apply"].includes(path)
  )
    return false;
  const body = await readBody(request);
  if (path === "/api/v1/cluster/lifecycle/plan") {
    response.json(200, {
      ok: true,
      operation: `cluster.${body.action}.plan`,
      status: "planned",
      data: planLifecycle(body.action, {
        enabled,
        ready: (await getStatus()).ready,
        quorum: body.quorum === true,
        synced: body.synced === true,
        nodeId,
        target: body.target,
      }),
    });
    return true;
  }
  if (!lifecycle)
    throw Object.assign(new Error("lifecycle manager is unavailable"), { statusCode: 503 });
  const data = await lifecycle.execute(body.action, body);
  response.json(202, { ok: true, operation: `cluster.${body.action}.apply`, ...data });
  return true;
}
