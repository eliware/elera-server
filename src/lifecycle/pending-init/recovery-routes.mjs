import { json } from "./responses.mjs";
import { handlePendingRecoveryStatusRoute } from "./pending/recovery/status-routes.mjs";
import { handlePendingRecoveryPlanRoute } from "./pending/recovery/plan-routes.mjs";
import { handlePendingRecoveryAuthorizationRoute } from "./pending/recovery/authorization-routes.mjs";
import { handlePendingRecoveryJoinRoute } from "./pending/recovery/join-route.mjs";

const recoveryPath = (path) => path.startsWith("/api/v1/cluster/cold-recovery/");

export async function handlePendingRecoveryRoute({
  request,
  response,
  authorized,
  recoveryRequired,
  recoveryReason,
  recoveryProtocol,
  onRecoveryBootstrap,
  onRecoveryComplete,
  onRecoveryJoin,
  identity,
  members = [],
  log,
}) {
  const path = new URL(request.url, "http://pending-init.invalid").pathname;
  if (!recoveryRequired || !recoveryPath(path)) return false;
  if (!authorized(request)) {
    json(response, 401, { ok: false, error: "authentication required" });
    return true;
  }
  const shared = { request, response };
  if (
    await handlePendingRecoveryStatusRoute({
      ...shared,
      recoveryReason,
      protocol: recoveryProtocol,
    })
  )
    return true;
  if (await handlePendingRecoveryPlanRoute({ ...shared, protocol: recoveryProtocol })) return true;
  if (
    await handlePendingRecoveryAuthorizationRoute({
      ...shared,
      protocol: recoveryProtocol,
      onRecoveryBootstrap,
      onRecoveryComplete,
      log,
    })
  )
    return true;
  return handlePendingRecoveryJoinRoute({
    ...shared,
    identity,
    members,
    onJoin: onRecoveryJoin,
  });
}
