import { readBody } from "../http.mjs";
import { bootstrapEligibility } from "../../cluster/bootstrap-eligibility.mjs";

export async function handleClusterBootstrapRoute({
  method,
  path,
  request,
  response,
  getStatus,
  bootstrap,
  enabled,
  nodeId,
}) {
  if (method !== "POST" || path !== "/api/v1/cluster/bootstrap") return false;
  const body = await readBody(request);
  if (body.confirm !== true)
    throw Object.assign(new Error("bootstrap requires confirm: true"), { statusCode: 409 });
  const data = await getStatus();
  const eligibility = bootstrapEligibility({
    enabled,
    ready: data.ready,
    state: data.values?.wsrep_local_state_comment,
  });
  if (!eligibility.eligible)
    throw Object.assign(new Error(eligibility.reason), {
      statusCode: 409,
      code: "BOOTSTRAP_NOT_ELIGIBLE",
    });
  if (typeof bootstrap !== "function")
    throw Object.assign(new Error("bootstrap is unavailable"), { statusCode: 503 });
  await bootstrap();
  response.json(202, {
    ok: true,
    operation: "cluster.bootstrap",
    changed: true,
    status: "completed",
    data: { identity: nodeId },
  });
  return true;
}
