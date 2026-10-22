export const allowed = (auth, scope) =>
  auth?.root || auth?.scopes?.includes("*") || auth?.scopes?.includes(scope);

export function assertBoundResource(auth, body) {
  if (
    (auth?.identity && body.identity && body.identity !== auth.identity) ||
    (auth?.application && body.application && body.application !== auth.application)
  )
    throw Object.assign(new Error("requested resource is not approved for this token"), {
      statusCode: 403,
    });
}

export function boundResource(auth) {
  return auth?.root
    ? {}
    : {
        ...(auth?.identity ? { identity: auth.identity } : {}),
        ...(auth?.application ? { application: auth.application } : {}),
        ...(auth?.database ? { database: auth.database } : {}),
      };
}
