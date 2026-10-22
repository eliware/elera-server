import { handleColdBootstrapEvidence } from "./cold/bootstrap/evidence.mjs";
import { handleColdBootstrapLocal } from "./cold/bootstrap/local.mjs";
import { handleClusterStatusRoute } from "./cluster/status-routes.mjs";
import { handleClusterBootstrapRoute } from "./cluster/bootstrap-routes.mjs";
import { handleClusterColdBootstrapRoute } from "./cluster/cold-bootstrap-routes.mjs";
import { handleClusterLifecycleRoute } from "./cluster/lifecycle-routes.mjs";

export async function handleClusterRoute({
  method,
  path,
  request,
  response,
  url,
  getStatus,
  bootstrap,
  lifecycle,
  getConfig,
  identity,
  coldBootstrap,
  coldEvidence,
  coldBootstrapLocal,
  internal = false,
  auth,
}) {
  const config = getConfig?.() ?? {};
  const enabled = config.elera ?? config.clusterSize > 1;
  if (!identity?.name) throw new Error("runtime identity is required for cluster routes");
  if (await handleColdBootstrapEvidence({ method, path, response, coldEvidence })) return true;
  if (
    await handleColdBootstrapLocal({
      method,
      path,
      request,
      response,
      coldBootstrapLocal,
      internal,
    })
  )
    return true;
  const shared = { method, path, response, getStatus, enabled };
  if (await handleClusterStatusRoute({ ...shared, url })) return true;
  const operations = { ...shared, request, nodeId: identity.name, auth };
  if (await handleClusterBootstrapRoute({ ...operations, bootstrap })) return true;
  if (await handleClusterColdBootstrapRoute({ ...shared, request, service: coldBootstrap }))
    return true;
  if (await handleClusterLifecycleRoute({ ...operations, lifecycle })) return true;
  return false;
}
