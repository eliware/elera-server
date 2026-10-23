import { readBody } from "../http.mjs";
import { handleRoutingInspection } from "./routing/inspection.mjs";
import { allowed, assertBoundResource, boundResource } from "./routing/authorization.mjs";

export async function handleRoutingRoute({
  method,
  path,
  url,
  request,
  response,
  observationStore,
  routingBundles,
  routingEvent,
  auth,
  getStatus,
  getActiveIntent,
  getConfig,
  environment,
  identity,
  fetchImpl,
} = {}) {
  if (!identity?.name) throw new Error("runtime identity is required for routing routes");
  if (path === "/api/v1/routes" && method === "GET")
    return handleRoutingInspection({
      url,
      response,
      observationStore,
      routingEvent,
      getStatus,
      getActiveIntent,
      getConfig,
      environment,
      identity,
      fetchImpl,
    });
  if (path === "/api/v1/routes/refresh" && method === "POST") {
    if (!allowed(auth, "credential:refresh")) return false;
    if (!auth?.root && !auth?.identity)
      throw Object.assign(new Error("identity-bound credential access is required"), {
        statusCode: 403,
      });
    const body = await readBody(request);
    assertBoundResource(auth, body);
    const bundle = await routingBundles.lease({ ...body, ...boundResource(auth) });
    response.json(200, {
      ok: true,
      operation: "routes.refresh",
      data: { routes: bundle.routes, bundleVersion: bundle.bundleVersion },
    });
    return true;
  }
  if (path === "/api/v1/routing/bundle" && method === "GET") {
    if (!allowed(auth, "credential:issue") && !allowed(auth, "credential:refresh")) return false;
    const requestedIdentity = url.searchParams.get("identity");
    if (!auth?.root && requestedIdentity && requestedIdentity !== auth?.identity)
      throw Object.assign(new Error("identity is not approved for this token"), {
        statusCode: 403,
      });
    const requestedNodeIdentity = requestedIdentity ?? auth?.identity;
    if (!requestedNodeIdentity)
      throw Object.assign(new Error("identity is required"), { statusCode: 400 });
    response.json(200, {
      ok: true,
      operation: "routing.bundle",
      data: await routingBundles.lease({
        identity: requestedNodeIdentity,
        application: auth?.application,
        database: auth?.database,
        tokenId: auth?.tokenId,
        sqlToken: auth?.sqlToken,
      }),
    });
    return true;
  }
  return false;
}
