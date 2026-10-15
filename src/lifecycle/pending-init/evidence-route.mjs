import { json } from "./responses.mjs";

export async function handlePendingInitEvidenceRoute(
  request,
  response,
  { authorized, coldEvidence },
) {
  if (request.method !== "GET" || request.url !== "/api/v1/cluster/cold-bootstrap/evidence")
    return false;
  if (!authorized(request)) {
    json(response, 401, { ok: false, error: "authentication required" });
    return true;
  }
  if (typeof coldEvidence !== "function") {
    json(response, 503, { ok: false, error: "cold bootstrap evidence is unavailable" });
    return true;
  }
  try {
    json(response, 200, {
      ok: true,
      operation: "cluster.cold-bootstrap.evidence",
      status: "completed",
      data: await coldEvidence(),
    });
  } catch (error) {
    json(response, 503, { ok: false, error: error.message });
  }
  return true;
}
