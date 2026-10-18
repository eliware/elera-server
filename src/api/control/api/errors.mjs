import { json } from "../../http.mjs";

export function respondToControlApiError(error, target, request, log) {
  log?.error("Control API request failed", { error, method: request.method, url: request.url });
  json(target, error.statusCode ?? 500, { ok: false, error: error.message ?? String(error) });
}
