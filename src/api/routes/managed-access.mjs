import { readBody } from "../http.mjs";

const allowed = (auth, scope, application) =>
  auth?.root ||
  auth?.scopes?.includes(scope) ||
  (auth?.scopes?.includes("app:admin") && (!application || auth.application === application));

export async function handleManagedAccessRoute({ method, path, request, response, managed, auth }) {
  if (method === "POST" && path === "/api/v1/tokens") {
    const body = await readBody(request);
    if (!allowed(auth, "token:create", body.application)) return false;
    if (!Array.isArray(body.scopes))
      throw Object.assign(new Error("explicit token scopes are required"), { statusCode: 400 });
    response.json(200, {
      ok: true,
      operation: "token.create",
      data: await managed.issueToken(body),
    });
    return true;
  }
  if (method === "POST" && path === "/api/v1/tokens/revoke") {
    const body = await readBody(request);
    if (!allowed(auth, "token:revoke", body.application)) return false;
    response.json(200, {
      ok: true,
      operation: "token.revoke",
      data: await managed.revokeToken({ tokenName: body.name, application: body.application }),
    });
    return true;
  }
  if (method === "POST" && path === "/api/v1/identities/revoke") {
    const body = await readBody(request);
    const application = body.application ?? auth?.application;
    if (
      !allowed(auth, "identity:revoke", application) ||
      (auth?.application && auth.application !== application)
    )
      return false;
    response.json(200, {
      ok: true,
      operation: "identity.revoke",
      data: await managed.revokeIdentity({
        identity: body.identity,
        application,
      }),
    });
    return true;
  }
  return false;
}
