import { json } from "./responses.mjs";

export async function handlePendingRecoveryPlanRoute({ request, response, protocol }) {
  const path = new URL(request.url, "http://pending-init.invalid").pathname;
  if (request.method !== "POST" || !(path.endsWith("/plan") || path.endsWith("/retry")))
    return false;
  if (!protocol) {
    json(response, 503, { ok: false, error: "cold recovery is unavailable" });
    return true;
  }
  const retry = path.endsWith("/retry");
  try {
    json(response, 200, {
      ok: true,
      operation: `cluster.cold-recovery.${retry ? "retry" : "plan"}`,
      data: await protocol[retry ? "retry" : "plan"](),
    });
  } catch (error) {
    json(response, error.statusCode ?? 503, {
      ok: false,
      error: error.message,
      code: error.code,
    });
  }
  return true;
}
