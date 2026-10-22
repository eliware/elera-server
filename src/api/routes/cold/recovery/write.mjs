import { readBody } from "../../../http.mjs";

const allowed = (auth) =>
  auth?.root || auth?.scopes?.includes("*") || auth?.scopes?.includes("recovery:write");

export async function handleColdRecoveryWriteRoute({
  method,
  path,
  request,
  response,
  protocol,
  auth,
  internal = false,
} = {}) {
  if (method !== "POST" || (!internal && !allowed(auth))) return false;
  const actions = {
    "/api/v1/cluster/cold-recovery/retry": ["retry", 200],
    "/api/v1/cluster/cold-recovery/authorize": ["authorize", 202],
    "/api/v1/cluster/cold-recovery/bootstrap": ["beginBootstrap", 202],
    "/api/v1/cluster/cold-recovery/complete": ["complete", 202],
  };
  const action = actions[path];
  if (!action) return false;
  const body = action[0] === "retry" ? undefined : await readBody(request);
  if (action[0] !== "retry" && body.confirm !== true)
    throw Object.assign(new Error("recovery mutation requires confirm: true"), { statusCode: 409 });
  if (action[0] === "authorize")
    throw Object.assign(
      new Error("recovery authorization is handled by the local lease coordinator"),
      {
        statusCode: 403,
      },
    );
  const data = action[0] === "retry" ? await protocol.retry() : await protocol[action[0]](body);
  response.json(action[1], {
    ok: true,
    operation: `cluster.cold-recovery.${path.split("/").pop()}`,
    data,
  });
  return true;
}
