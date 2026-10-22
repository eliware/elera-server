import { verifyJoinedMember } from "../../../cluster/cold-bootstrap/join-verification.mjs";

export async function verifyRecoveryJoiner({
  joiner,
  fetchImpl,
  token,
  timeoutMs,
  httpPort = 8080,
  bootstrap,
  members,
}) {
  const url = (joiner.url ?? `http://${joiner.address}:${httpPort}`).replace(/\/$/, "");
  const response = await fetchImpl(`${url}/api/v1/cluster/status`, {
    headers: { accept: "application/json", authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(timeoutMs),
  });
  let body;
  try {
    body = await response.json();
  } catch {
    body = {};
  }
  if (!response.ok || body.ok === false)
    return {
      valid: false,
      node: joiner.name,
      reason: body.error ?? `cluster status returned ${response.status}`,
    };
  return {
    ...verifyJoinedMember({
      values: body.data?.values ?? body.data ?? {},
      expectedClusterId: bootstrap?.clusterId,
      expectedSize: members.length,
    }),
    node: joiner.name,
  };
}
