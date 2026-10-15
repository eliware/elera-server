import { readBody } from "../../api/http.mjs";
import { json } from "./responses.mjs";

export async function handlePendingInitResetRoute(
  request,
  response,
  { authorized, nodeDataReset },
) {
  if (request.method !== "POST" || request.url !== "/api/v1/node/data/reset") return false;
  if (!authorized(request)) {
    json(response, 401, { ok: false, error: "authentication required" });
    return true;
  }
  if (!nodeDataReset) {
    json(response, 503, {
      ok: false,
      error: "node data reset is unavailable before supervisor recovery is configured",
    });
    return true;
  }
  try {
    const data = await nodeDataReset.reset(await readBody(request));
    json(response, data.dryRun ? 200 : 202, {
      ok: true,
      operation: "node.data.reset",
      status: data.status,
      data,
    });
  } catch (error) {
    json(response, error.statusCode ?? 500, { ok: false, error: error.message });
  }
  return true;
}
