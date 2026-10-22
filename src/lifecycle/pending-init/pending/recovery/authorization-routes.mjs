import { readBody } from "../../../../api/http.mjs";
import { json } from "../../responses.mjs";

export async function handlePendingRecoveryAuthorizationRoute({
  request,
  response,
  protocol,
  onRecoveryBootstrap,
  onRecoveryComplete,
  log,
}) {
  const path = new URL(request.url, "http://pending-init.invalid").pathname;
  if (
    request.method !== "POST" ||
    !["/authorize", "/bootstrap", "/complete"].some((suffix) => path.endsWith(suffix))
  )
    return false;
  if (!protocol) {
    json(response, 503, { ok: false, error: "cold recovery is unavailable" });
    return true;
  }
  let body;
  try {
    body = await readBody(request);
  } catch (error) {
    json(response, 400, { ok: false, error: error.message });
    return true;
  }
  const operation = path.endsWith("/authorize")
    ? "authorize"
    : path.endsWith("/bootstrap")
      ? "beginBootstrap"
      : "complete";
  if (body.confirm !== true) {
    json(response, 409, { ok: false, error: "recovery action requires confirm: true" });
    return true;
  }
  if (operation === "authorize") {
    json(response, 403, {
      ok: false,
      error: "recovery authorization requires the local lease coordinator",
    });
    return true;
  }
  if (typeof protocol[operation] !== "function") {
    json(response, 503, {
      ok: false,
      error: `cold recovery operation ${operation} is unavailable`,
    });
    return true;
  }
  try {
    const data = await protocol[operation](body);
    if (operation === "beginBootstrap")
      response.once("finish", () =>
        Promise.resolve()
          .then(() => onRecoveryBootstrap(data))
          .catch((error) => log.error?.("Pending recovery bootstrap handoff failed", { error })),
      );
    if (operation === "complete")
      response.once("finish", () =>
        Promise.resolve()
          .then(() => onRecoveryComplete(data))
          .catch((error) => log.error?.("Pending recovery handoff failed", { error })),
      );
    json(response, 202, {
      ok: true,
      operation: `cluster.cold-recovery.${operation === "beginBootstrap" ? "bootstrap" : operation}`,
      data,
    });
  } catch (error) {
    json(response, error.statusCode ?? 409, {
      ok: false,
      error: error.message,
      code: error.code,
    });
  }
  return true;
}
