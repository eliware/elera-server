import { isEvidenceFqdn } from "./evidence/fqdn.mjs";

export function createRemoteRecoveryEvidence({ fetchImpl = fetch, token, timeoutMs = 2000 } = {}) {
  const remote = async (url, expectedNode) => {
    if (typeof url !== "string" || !url)
      throw Object.assign(
        new Error(
          `recovery data request requires a URL: expectedNode=${expectedNode ?? "<unknown>"}`,
        ),
        { code: "RECOVERY_EVIDENCE_UNAVAILABLE", expectedNode },
      );
    let peerUrl;
    try {
      peerUrl = new URL(url);
    } catch (error) {
      throw Object.assign(
        new Error(
          `recovery data request requires a valid URL: expectedNode=${expectedNode ?? "<unknown>"}. Error=${error.message}`,
        ),
        { code: "RECOVERY_EVIDENCE_UNAVAILABLE", expectedNode, cause: error },
      );
    }
    if (!isEvidenceFqdn(peerUrl.hostname))
      throw Object.assign(
        new Error(
          `recovery data request requires an FQDN URL: expectedNode=${expectedNode ?? "<unknown>"}. Endpoint=${url}`,
        ),
        { code: "RECOVERY_EVIDENCE_UNAVAILABLE", expectedNode },
      );
    const endpoint = `${url.replace(/\/$/, "")}/api/v1/cluster/cold-bootstrap/evidence`;
    let response;
    try {
      response = await fetchImpl(endpoint, {
        headers: { accept: "application/json", authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw Object.assign(
        new Error(
          `recovery data request failed: expectedNode=${expectedNode ?? "<unknown>"}. Endpoint=${endpoint}. Error=${error.message}`,
        ),
        { code: "RECOVERY_EVIDENCE_UNAVAILABLE", endpoint, expectedNode, cause: error },
      );
    }
    if (!response.ok)
      throw Object.assign(
        new Error(
          `recovery data request failed: expectedNode=${expectedNode ?? "<unknown>"}. Endpoint=${endpoint}. Status=${response.status}`,
        ),
        {
          code: "RECOVERY_EVIDENCE_UNAVAILABLE",
          endpoint,
          expectedNode,
          statusCode: response.status,
        },
      );
    let body;
    try {
      body = await response.json();
    } catch (error) {
      throw Object.assign(
        new Error(
          `peer returned invalid recovery data JSON: expectedNode=${expectedNode ?? "<unknown>"}. Endpoint=${endpoint}. Error=${error.message}`,
        ),
        { code: "INVALID_RECOVERY_EVIDENCE", endpoint, expectedNode, cause: error },
      );
    }
    const data = body?.data;
    if (!data || typeof data !== "object" || typeof data.node !== "string")
      throw Object.assign(
        new Error(
          `peer returned malformed recovery data: expectedNode=${expectedNode ?? "<unknown>"}. Endpoint=${endpoint}. RespondingNode=${data?.node ?? "<missing>"}`,
        ),
        { code: "INVALID_RECOVERY_EVIDENCE", endpoint, expectedNode, actualNode: data?.node },
      );
    if (expectedNode && data.node !== expectedNode)
      throw Object.assign(
        new Error(
          `peer data identity mismatch: expectedNode=${expectedNode}. RespondingNode=${data.node}. Endpoint=${endpoint}`,
        ),
        {
          code: "RECOVERY_EVIDENCE_IDENTITY_MISMATCH",
          endpoint,
          expectedNode,
          actualNode: data.node,
          deterministic: true,
        },
      );
    return data;
  };
  return remote;
}
