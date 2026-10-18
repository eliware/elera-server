import { handlePendingColdRecoveryRoute } from "./recovery/pending.mjs";
import { handleColdRecoveryReadRoute } from "./recovery/read.mjs";
import { handleColdRecoveryWriteRoute } from "./recovery/write.mjs";

const allowed = (auth, scope) =>
  auth?.root || auth?.scopes?.includes("*") || auth?.scopes?.includes(scope);
export async function handleColdRecoveryRoute({
  method,
  path,
  request,
  response,
  protocol,
  auth,
  internal = false,
} = {}) {
  if (!method || !path) return false;
  if (!protocol)
    return handlePendingColdRecoveryRoute({
      method,
      path,
      response,
      authorized: allowed(auth, "recovery:read") || internal,
    });
  const shared = { method, path, request, response, protocol, auth, internal };
  if (await handleColdRecoveryReadRoute(shared)) return true;
  return handleColdRecoveryWriteRoute(shared);
}
