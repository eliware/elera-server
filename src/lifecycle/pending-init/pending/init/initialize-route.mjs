import { readBody } from "../../../../api/http.mjs";
import { json } from "../../responses.mjs";

const paths = [
  "/api/v1/cluster/bootstrap",
  "/api/v1/cluster/join",
  "/api/v1/cluster/lifecycle/apply",
  "/api/v1/initialization/apply",
];

export function createPendingInitializationRoute({
  authorized,
  environment,
  initialize,
  log,
  onInitialized,
  recoveryReason,
  recoveryRequired,
  standaloneOperation,
}) {
  let operation;
  return async function handlePendingInitializationRoute(request, response) {
    if (request.method !== "POST" || !paths.includes(request.url)) return false;
    if (!authorized(request)) {
      json(response, 401, { ok: false, error: "authentication required" });
      return true;
    }
    let body;
    try {
      body = await readBody(request);
    } catch (error) {
      json(response, 400, { ok: false, error: error.message });
      return true;
    }
    if (
      recoveryRequired &&
      request.url.endsWith("/lifecycle/apply") &&
      body.action === "bootstrap"
    ) {
      json(response, 503, {
        ok: false,
        error: "cluster recovery required. Initialization is not permitted.",
        reason: recoveryReason,
      });
      return true;
    }
    if (body.confirm !== true) {
      json(response, 409, { ok: false, error: "explicit confirmation required" });
      return true;
    }
    let operationName;
    try {
      if (
        request.url.endsWith("/lifecycle/apply") &&
        !["bootstrap", "join"].includes(body.action)
      ) {
        json(response, 400, { ok: false, error: "unsupported lifecycle action" });
        return true;
      }
      operationName =
        request.url.endsWith("/join") ||
        (request.url.endsWith("/lifecycle/apply") && body.action === "join")
          ? "join"
          : request.url.endsWith("/initialization/apply")
            ? standaloneOperation()
            : "bootstrap";
    } catch (error) {
      json(response, error.statusCode ?? 400, { ok: false, error: error.message });
      return true;
    }
    if (operation) {
      json(response, 409, { ok: false, error: `${operationName} previously in progress` });
      return true;
    }
    operation = Promise.resolve().then(() => initialize({ environment, log }));
    try {
      await operation;
      json(response, 202, {
        ok: true,
        operation: request.url.endsWith("/initialization/apply")
          ? "initialization.apply"
          : `cluster.${operationName}`,
        status: "completed",
      });
      response.once("finish", () => {
        if (operationName !== "join-pending")
          Promise.resolve()
            .then(() => onInitialized(operationName))
            .catch((error) => log.error?.("Pending initialization handoff failed", { error }));
      });
    } catch (error) {
      log.error?.("Pending initialization failed", { error });
      json(response, 500, { ok: false, error: error.message });
    } finally {
      operation = undefined;
    }
    return true;
  };
}
