import { json } from "./responses.mjs";

export function handlePendingInitAuthRoute(request, response, { authorized, recoveryReason }) {
  if (
    request.method !== "POST" ||
    !["/api/v1/cluster/bootstrap", "/api/v1/initialization/apply"].includes(request.url)
  )
    return false;
  if (!authorized(request)) {
    json(response, 401, { ok: false, error: "authentication required" });
    return true;
  }
  json(response, 503, {
    ok: false,
    error: "cluster recovery required; initialization is not permitted",
    reason: recoveryReason,
  });
  return true;
}
