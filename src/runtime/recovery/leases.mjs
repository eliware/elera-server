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
        const granted = response.ok && (await response.json()).data?.granted === true;
        recoveryAudit.lease({ node: node.name, granted, epoch: decision.epoch });
        return granted;
      } catch {
        recoveryAudit.lease({ node: node.name, granted: false, epoch: decision.epoch });
        return false;
      }
    }),
  );
  return claims;
}
