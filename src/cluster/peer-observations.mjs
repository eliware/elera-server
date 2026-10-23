import { createObservation } from "./observation.mjs";
const peerUrl = (peer) => {
  const value =
    typeof peer === "string"
      ? peer
      : peer?.address
        ? `http://${peer.address}:${peer.httpPort ?? peer.port ?? 8080}`
        : null;
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError("peer URLs must be valid HTTP(S) URLs");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.hostname.includes(":") ||
    !url.hostname.includes(".") ||
    url.hostname.endsWith(".")
  )
    throw new TypeError("peer URLs must be valid HTTP(S) URLs");
  if (peer && typeof peer === "object" && peer.name !== url.hostname)
    throw new TypeError("peer identity and address must match");
  return { base: value.replace(/\/+$/, ""), hostname: url.hostname };
};
export function createPeerObservationClient({
  peers = [],
  members,
  token,
  fetchImpl = fetch,
  store,
  timeoutMs = 2000,
  log = {},
} = {}) {
  if (!store || typeof store.upsert !== "function")
    throw new TypeError("observation store is required");
  const targets = [
    ...new Map(
      peers.filter(Boolean).map((peer) => {
        const parsed = peerUrl(peer);
        return [parsed.base, parsed];
      }),
    ).values(),
  ];
  const memberNames = new Set(
    (members ?? targets.map(({ hostname }) => hostname)).map((member) =>
      typeof member === "string" ? member : member?.name,
    ),
  );
  const headers = () => ({
    accept: "application/json",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  });
  return {
    async publish(observation) {
      const normalized = createObservation(observation);
      return Promise.all(
        targets.map(async ({ base }) => {
          try {
            const response = await fetchImpl(`${base}/api/v1/cluster/observations`, {
              method: "POST",
              headers: {
                ...headers(),
                ...(token ? { "x-elera-internal": "true", "x-elera-peer-token": token } : {}),
                "content-type": "application/json",
              },
              body: JSON.stringify(normalized),
              signal: AbortSignal.timeout(timeoutMs),
            });
            if (!response.ok) throw new Error(`peer returned ${response.status}`);
            return { accepted: true };
          } catch (error) {
            log.warn?.("Peer observation publish failed", { peer: base, error });
            return { accepted: false, reason: "unavailable" };
          }
        }),
      );
    },
    async refresh() {
      const results = await Promise.all(
        targets.map(async ({ base }) => {
          try {
            const response = await fetchImpl(`${base}/api/v1/cluster/observations`, {
              headers: headers(),
              signal: AbortSignal.timeout(timeoutMs),
            });
            if (!response.ok) throw new Error(`peer returned ${response.status}`);
            const body = await response.json();
            return (body.data ?? []).map((raw) => {
              const observation = createObservation(raw);
              if (!memberNames.has(observation.nodeId)) {
                log.warn?.("Peer observation identity mismatch", {
                  peer: base,
                  expectedNodes: [...memberNames],
                  respondingNode: observation.nodeId,
                });
                return { accepted: false, reason: "identity-mismatch" };
              }
              return store.upsert(observation);
            });
          } catch (error) {
            log.warn?.("Peer observation refresh failed", { peer: base, error });
            return [{ accepted: false, reason: "unavailable" }];
          }
        }),
      ).then((groups) => groups.flat());
      return results;
    },
  };
}
