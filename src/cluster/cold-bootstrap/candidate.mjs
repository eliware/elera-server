const isFqdn = (value) =>
  typeof value === "string" &&
  value.length <= 253 &&
  value.includes(".") &&
  value.split(".").every((label) => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label));

export function selectCandidate(states, { minimumHistorySize = 1 } = {}) {
  if (!Array.isArray(states) || states.length === 0)
    throw new Error("no Galera state data was provided");
  if (
    states.some((state) => !isFqdn(state?.node) || !state?.uuid || !Number.isInteger(state.seqno))
  )
    return { eligible: false, reason: "incomplete recovery data", candidates: states };
  const histories = Map.groupBy(states, (state) => state.uuid);
  const ranked = [...histories.entries()]
    .map(([uuid, candidates]) => ({
      uuid,
      candidates,
      highest: Math.max(...candidates.map(({ seqno }) => seqno)),
    }))
    .sort(
      (left, right) =>
        right.highest - left.highest ||
        right.candidates.length - left.candidates.length ||
        left.uuid.localeCompare(right.uuid),
    );
  if (ranked.length > 1)
    return {
      eligible: false,
      code: "SPLIT_BRAIN",
      reason: "conflicting cluster UUID histories prevent recovery",
      candidates: states,
      histories: ranked,
    };
  const strongest = ranked[0];
  if (strongest.candidates.length < minimumHistorySize)
    return {
      eligible: false,
      code: "INSUFFICIENT_RECOVERY_EVIDENCE",
      reason: "authoritative recovery history has not reached quorum",
      candidates: states,
      histories: ranked,
    };
  const candidates = strongest.candidates;
  const highest = strongest.highest;
  if (highest < 0)
    return { eligible: false, reason: "no recoverable seqno exists", candidates: states };
  const winners = candidates.filter((state) => state.seqno === highest);
  if (winners.length !== 1) {
    const candidate = winners.slice().sort((left, right) => left.node.localeCompare(right.node))[0];
    return {
      eligible: true,
      reason: "equivalent highest seqno candidates. Deterministic winner selected",
      candidate,
      candidates,
      divergent: [],
      histories: ranked,
    };
  }
  return {
    eligible: true,
    reason: "unique highest seqno",
    candidate: winners[0],
    candidates,
    divergent: [],
    histories: ranked,
  };
}
