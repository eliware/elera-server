import { createSupervisorBundle } from "../internal/routing/bundle.mjs";
import { validateCredentialLeaseRequest } from "../routing-policy.mjs";
import { readBody } from "./http.mjs";

export async function handleControlCredentialRoute(
  { method, url, request, response, environment },
  {
    leaseCredentials,
    managed,
    validate = validateCredentialLeaseRequest,
    read = readBody,
    bundle = createSupervisorBundle,
  } = {},
) {
  if (method === "POST" && url.pathname === "/api/v1/credentials/lease") {
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
    return manageLease({ request, response, managed, url, read, bundle, environment });
  return false;
}

async function manageLease({ request, response, managed, url, read, bundle, environment }) {
  const body = await read(request);
  if (typeof managed?.lease !== "function") {
    response.json(501, { ok: false, error: "credential management is not configured" });
    return true;
  }
  if (url.pathname.endsWith("/revoke")) {
    const result = await managed.revokeIdentity(body.identity);
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

const defaultPorts = (environment) => ({
  sql: Number(environment.ELERA_NODE_SQL_PORT ?? 3306),
  http: Number(environment.ELERA_HTTP_PORT ?? 8080),
});
