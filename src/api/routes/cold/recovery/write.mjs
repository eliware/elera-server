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
  if (action[0] === "authorize" && body.force === true && !auth?.root)
    throw Object.assign(new Error("forced recovery requires root administrator authorization"), {
      statusCode: 403,
    });
  const data =
    action[0] === "retry"
      ? await protocol.retry()
      : await protocol[action[0]](
          action[0] === "authorize" ? { ...body, force: body.force === true && auth.root } : body,
        );
  response.json(action[1], {
    ok: true,
    operation: `cluster.cold-recovery.${path.split("/").pop()}`,
    data,
  });
  return true;
}
