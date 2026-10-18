import { json } from "../../responses.mjs";

export async function handlePendingRecoveryStatusRoute({
  request,
  response,
  recoveryReason,
  protocol,
}) {
  const path = new URL(request.url, "http://pending-init.invalid").pathname;
  if (request.method === "GET" && path.endsWith("/status")) {
    try {
      json(response, 200, {
        ok: true,
        operation: "cluster.cold-recovery.status",
        data: (await protocol?.status?.()) ?? { phase: "blocked", reason: recoveryReason },
      });
    } catch (error) {
      json(response, 503, { ok: false, error: error.message, code: error.code });
    }
    return true;
  }
  if (request.method === "GET" && path.endsWith("/evidence")) {
    try {
      json(response, 200, {
        ok: true,
        operation: "cluster.cold-recovery.evidence",
        data: (await protocol?.evidence?.()) ?? [],
      });
    } catch (error) {
      json(response, 503, { ok: false, error: error.message, code: error.code });
    }
    return true;
  }
  return false;
}
