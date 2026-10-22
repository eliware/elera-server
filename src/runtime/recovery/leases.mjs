export async function acquireRecoveryLeases({
  decision,
  members,
  config,
  environment,
  fetchImpl,
  recoveryAudit,
}) {
  const claims = await Promise.all(
    members.map(async (node) => {
      const url = node.url ?? `http://${node.name}:${config.httpPort}`;
      const parsed = new URL(url);
      if (parsed.hostname !== node.name)
        throw new Error(`recovery lease URL ${url} does not match configured member ${node.name}`);
      try {
        const response = await fetchImpl(
          `${url.replace(/\/$/, "")}/api/v1/cluster/cold-bootstrap/lease`,
          {
            method: "POST",
            headers: {
              authorization: `Bearer ${environment.ELERA_PEER_TOKEN ?? environment.ROOT_TOKEN}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({ epoch: decision.epoch, winner: decision.winner }),
            signal: AbortSignal.timeout(config.timeoutMs),
          },
        );
        const claim = response.ok ? (await response.json()).data : undefined;
        const granted =
          claim?.granted === true &&
          claim.epoch === decision.epoch &&
          claim.winner === decision.winner;
        recoveryAudit.lease({ node: node.name, granted, epoch: decision.epoch });
        return leaseClaim(node.name, decision, granted, response.ok && claim);
      } catch {
        recoveryAudit.lease({ node: node.name, granted: false, epoch: decision.epoch });
        return leaseClaim(node.name, decision, false);
      }
    }),
  );
  return claims;
}

function leaseClaim(member, decision, granted, peerClaim) {
  return {
    member,
    epoch: peerClaim?.epoch,
    winner: peerClaim?.winner,
    granted,
    authenticated: Boolean(peerClaim && granted),
  };
}
