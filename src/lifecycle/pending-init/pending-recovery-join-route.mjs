import { readBody } from "../../api/http.mjs";
import { json } from "./responses.mjs";

const isFqdn = (value) =>
  typeof value === "string" &&
  value.length <= 253 &&
  value.includes(".") &&
  !value.endsWith(".") &&
  /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(value);

export async function handlePendingRecoveryJoinRoute({
  request,
  response,
  identity,
  members,
  onJoin,
}) {
  const path = new URL(request.url, "http://pending-init.invalid").pathname;
  if (request.method !== "POST" || !path.endsWith("/join")) return false;
  let body;
  try {
    body = await readBody(request);
    if (!isFqdn(body.node))
      throw Object.assign(new Error("recovery join node must be a fully qualified hostname"), {
        statusCode: 400,
      });
    if (body.node === identity?.name)
      throw Object.assign(
        new Error(`recovery join target ${body.node} is the local runtime identity`),
        {
          statusCode: 409,
        },
      );
    if (!members.some((member) => member?.name === body.node))
      throw Object.assign(
        new Error(`recovery join target ${body.node} is not a configured cluster member`),
        {
          statusCode: 400,
        },
      );
    const data = await onJoin(body);
    json(response, 202, { ok: true, operation: "cluster.cold-recovery.join", data });
  } catch (error) {
    json(response, error.statusCode ?? (body ? 409 : 400), {
      ok: false,
      error: error.message,
      code: error.code,
    });
  }
  return true;
}
