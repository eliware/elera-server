export function resolveRoutingBundleIdentity(request, result, identity) {
  const application = result.application ?? request.application;
  const database = result.database ?? request.database;
  const credentialIdentity = result.identity ?? request.identity;
  if (request.application && result.application && request.application !== result.application)
    throw Object.assign(new Error("application is not approved for this token"), {
      statusCode: 403,
    });
  if (result.nodeIdentity && result.nodeIdentity !== identity.name)
    throw Object.assign(new Error("lease response identity does not match runtime identity"), {
      statusCode: 409,
    });
  return {
    application,
    database,
    credentialIdentity,
    key: result.application ?? request.application ?? "default",
  };
}
