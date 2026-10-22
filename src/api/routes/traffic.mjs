export async function handleTrafficRoute({
  method,
  path,
  request,
  response,
  getTraffic,
  setDrain,
  auth,
}) {
  if (method === "GET" && path === "/api/v1/traffic/status") {
    if (!allowed(auth, "cluster:read")) throw forbidden();
    response.json(200, {
      ok: true,
      operation: "traffic.status",
      status: "completed",
      data: getTraffic(),
    });
    return true;
  }
  const propagated = request?.headers?.["x-elera-drain-propagated"] === "true";
  if (method === "POST" && path === "/api/v1/traffic/drain") {
    if (!allowed(auth, "cluster:operate")) throw forbidden();
    setDrain(true, propagated);
    response.json(200, {
      ok: true,
      operation: "traffic.drain",
      changed: true,
      status: "completed",
    });
    return true;
  }
  if (method === "POST" && path === "/api/v1/traffic/undrain") {
    if (!allowed(auth, "cluster:operate")) throw forbidden();
    setDrain(false, propagated);
    response.json(200, {
      ok: true,
      operation: "traffic.undrain",
      changed: true,
      status: "completed",
    });
    return true;
  }
  return false;
}

const allowed = (auth, scope) =>
  auth?.root || auth?.scopes?.includes("*") || auth?.scopes?.includes(scope);
const forbidden = () =>
  Object.assign(new Error("traffic authorization is required"), { statusCode: 403 });
