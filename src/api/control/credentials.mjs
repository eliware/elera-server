import { createSupervisorBundle } from "../../internal/routing/bundle.mjs";
import { validateCredentialLeaseRequest } from "../../routing-policy.mjs";
import { readBody } from "../http.mjs";

export async function handleControlCredentialRoute(
  { method, url, request, response, environment, auth },
  {
    leaseCredentials,
    managed,
    validate = validateCredentialLeaseRequest,
    read = readBody,
    bundle = createSupervisorBundle,
  } = {},
) {
  if (method === "POST" && url.pathname === "/api/v1/credentials/lease") {
    if (!hasCredentialScope(auth)) {
      response.json(403, {
        ok: false,
        error: "a credential authorization scope is required",
      });
      return true;
    }
    const leaseRequest = validate(await read(request));
    if (typeof leaseCredentials !== "function") {
      response.json(501, {
        ok: false,
        operation: "credentials.lease",
        error: "credential leasing is not configured",
      });
      return true;
    }
    const result = await leaseCredentials(leaseRequest);
    response.json(200, {
      ok: true,
      operation: "credentials.lease",
      status: "completed",
      data: result.credentials
        ? result
        : bundle({ ...result, ports: result.ports ?? defaultPorts(environment) }),
    });
    return true;
  }
  if (
    method === "POST" &&
    ["/api/v1/credentials/refresh", "/api/v1/credentials/revoke"].includes(url.pathname)
  )
    return manageLease({ request, response, managed, url, read, bundle, environment, auth });
  return false;
}

async function manageLease({ request, response, managed, url, read, bundle, environment, auth }) {
  const body = await read(request);
  const requiredScope = "credential:refresh";
  if (!hasCredentialScope(auth, requiredScope)) {
    response.json(403, { ok: false, error: "a credential authorization scope is required" });
    return true;
  }
  if (typeof managed?.lease !== "function") {
    response.json(501, { ok: false, error: "credential management is not configured" });
    return true;
  }
  if (url.pathname.endsWith("/revoke")) {
    const application = body.application ?? auth?.application;
    if (auth?.application && auth.application !== application) {
      response.json(403, { ok: false, error: "identity belongs to another application" });
      return true;
    }
    const result = await managed.revokeIdentity({
      identity: body.identity,
      application,
    });
    response.json(200, { ok: true, operation: "credentials.revoke", data: result });
    return true;
  }
  const result = await managed.lease(body);
  response.json(200, {
    ok: true,
    operation: "credentials.refresh",
    status: "completed",
    data: bundle({ ...result, ports: result.ports ?? defaultPorts(environment) }),
  });
  return true;
}

function hasCredentialScope(auth, required) {
  return (
    auth?.root === true ||
    auth?.scopes?.includes("*") ||
    (required
      ? auth?.scopes?.includes(required)
      : auth?.scopes?.some((scope) => ["credential:issue", "credential:refresh"].includes(scope)))
  );
}

const defaultPorts = (environment) => ({
  sql: Number(environment.ELERA_NODE_SQL_PORT ?? 3306),
  http: Number(environment.ELERA_HTTP_PORT ?? 8080),
});
