import { isIP } from "node:net";

export function normalizeDrainPeers(peers = []) {
  return [
    ...new Set(
      peers.filter(Boolean).map((peer) => {
        if (typeof peer !== "string") throw new TypeError("drain target peers must be FQDN URLs");
        let url;
        try {
          url = new URL(peer);
        } catch {
          throw new TypeError("drain target peers must be FQDN URLs");
        }
        if (
          !["http:", "https:"].includes(url.protocol) ||
          url.username !== "" ||
          url.password !== "" ||
          isIP(url.hostname) ||
          !url.hostname.includes(".") ||
          url.hostname.endsWith(".")
        ) {
          throw new TypeError("drain target peers must be FQDN URLs");
        }
        return peer.replace(/\/+$/, "");
      }),
    ),
  ];
}
