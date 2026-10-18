import { readBody } from "../../http.mjs";

export async function handleClusterColdBootstrapRoute({
  method,
  path,
  request,
  response,
  service,
}) {
  if (
    method !== "POST" ||
    !["/api/v1/cluster/cold-bootstrap", "/api/v1/cluster/cold-bootstrap/plan"].includes(path)
  )
    return false;
  if (!service)
    throw Object.assign(new Error("cold bootstrap is unavailable"), { statusCode: 503 });
  if (path.endsWith("/plan")) {
    response.json(200, {
      ok: true,
      operation: "cluster.cold-bootstrap.plan",
      status: "planned",
      data: await service.plan(),
    });
    return true;
  }
  response.json(202, {
    ok: true,
    operation: "cluster.cold-bootstrap",
    status: "completed",
    data: await service.execute(await readBody(request)),
  });
  return true;
}
