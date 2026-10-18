import { json } from "../../responses.mjs";

export function handlePendingInitFallbackRoute(response, { recoveryReason, recoveryRequired }) {
  if (recoveryRequired)
    return json(response, 503, {
      ok: false,
      error: "cluster recovery required. Initialization is not permitted",
      reason: recoveryReason,
    });
  return json(response, 503, {
    ok: false,
    error: "pending initialization. Explicit initialization required",
  });
}
