import { readBody } from "../../http.mjs";
import { planLifecycle } from "../../../cluster/lifecycle/plan.mjs";

export async function handleClusterLifecycleRoute({
  method,
  path,
  request,
  response,
  getStatus,
  lifecycle,
  enabled,
  nodeId,
  auth,
}) {
  if (method !== "POST") return false;
  const alias = path.match(/^\/api\/v1\/cluster\/(join|leave|recover)(\/plan)?$/);
  const genericPlan = path === "/api/v1/cluster/lifecycle/plan";
  const genericApply = path === "/api/v1/cluster/lifecycle/apply";
  if (!alias && !genericPlan && !genericApply) return false;
  const scope = alias?.[2] || genericPlan ? "cluster:read" : "cluster:operate";
  if (!auth?.root && !auth?.scopes?.includes("*") && !auth?.scopes?.includes(scope)) return false;
  const body = await readBody(request);
  const action = alias ? alias[1] : body.action;
  if ((genericApply || (alias && !alias[2])) && body.confirm !== true)
    throw Object.assign(new Error("lifecycle apply requires confirm: true"), { statusCode: 409 });
  if (genericPlan || alias?.[2]) {
    response.json(200, {
      ok: true,
      operation: `cluster.${action}.plan`,
      status: "planned",
      data: planLifecycle(action, {
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
  const data = await lifecycle.execute(action, { ...body, action });
  response.json(202, { ok: true, operation: `cluster.${action}.apply`, ...data });
  return true;
}
