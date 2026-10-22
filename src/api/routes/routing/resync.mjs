export function handleRoutingResyncRoute({ method, path, url, response, getEvent, auth } = {}) {
  if (method !== "POST" || path !== "/api/v1/routing/resync") return false;
  if (!auth?.root && !auth?.scopes?.includes("*") && !auth?.scopes?.includes("routing:read"))
    throw Object.assign(new Error("routing read access is required"), { statusCode: 403 });
  const application = url.searchParams.get("application") ?? auth?.application ?? "default";
  if (auth?.application && application !== auth.application)
    throw Object.assign(new Error("application is not approved for this token"), {
      statusCode: 403,
    });
  const event = getEvent(application);
  response.json(200, { ok: true, operation: "routing.resync", data: event });
  return true;
}
