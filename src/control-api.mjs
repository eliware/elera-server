import { json } from "./api/http.mjs";
import { isInternalPeerRequest } from "./api/internal-auth.mjs";
import { authenticateControlRequest } from "./api/control/api/authentication.mjs";
import { respondToControlApiError } from "./api/control/api/errors.mjs";
import { dispatchControlRoute } from "./api/control/api/routing.mjs";
import { handleControlCredentialRoute } from "./api/control/credentials.mjs";
import { createControlRequestContext } from "./api/control/api/context.mjs";
import { createControlResponse } from "./api/control/response.mjs";
export function createControlApi(options = {}) {
  const { identity, environment = process.env, log } = options;
  const dataDir = options.dataDir ?? environment.MARIADB_DATA_DIR ?? "/var/lib/mysql";
  if (!identity?.name)
    throw new TypeError("shared runtime identity is required for the control API");
  const token = environment.ROOT_TOKEN;
  const handler = async (request, target) => {
    if (!request.url?.startsWith("/api/v1/")) return false;
    const auth = await authenticateControlRequest(request, {
      token,
      managed: options.managed,
      metadata: options.metadata,
    });
    if (!auth) {
      json(target, 401, { ok: false, error: "authentication required" });
      return true;
    }
    const out = createControlResponse(target, request);
    const url = new URL(request.url, "http://localhost");
    try {
      const internal = isInternalPeerRequest(request, environment, token);
      const context = createControlRequestContext(request, url, out, {
        ...options,
        environment,
        dataDir,
        observations: options.observations ?? [],
        auth,
        identity,
        internal,
      });
      if (
        await dispatchControlRoute(context, {
          applications: options.applications,
          nodeDataReset: options.nodeDataReset,
          reconciler: options.reconciler,
          artifactStore: options.artifactStore,
          routingBundles: options.routingBundles,
        })
      )
        return true;
      if (
        await handleControlCredentialRoute(context, {
          leaseCredentials: options.leaseCredentials,
          managed: options.managed,
        })
      )
        return true;
      out.json(404, { ok: false, error: "endpoint not found" });
      return true;
    } catch (error) {
      respondToControlApiError(error, target, request, log);
      return true;
    }
  };
  return { handler };
}
