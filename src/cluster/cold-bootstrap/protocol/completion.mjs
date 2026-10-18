import { transitionRecoveryEpoch } from "../recovery/epoch.mjs";

export async function completeRecoveryEpoch(
  { epoch, winner, clusterId, membership } = {},
  { read, persist, now, publishEvent, debug, setCurrent },
) {
  debug("Completing recovery epoch", { epoch, winner, clusterId, membership });
  const existing = await read();
  if (!existing || existing.epoch !== epoch)
    throw Object.assign(new Error("unknown or stale recovery epoch"), { statusCode: 409 });
  if (winner !== existing.winner?.node || clusterId !== existing.clusterId)
    throw Object.assign(new Error("recovery end authority does not match the approved epoch"), {
      statusCode: 409,
    });
  if (!Array.isArray(membership) || membership.length !== existing.quorum.length)
    throw Object.assign(new Error("recovery end membership does not match the approved quorum"), {
      statusCode: 409,
    });
  const members = [...new Set(membership)].sort();
  if (members.join("\0") !== existing.quorum.slice().sort().join("\0"))
    throw Object.assign(new Error("recovery end membership does not match the approved quorum"), {
      statusCode: 409,
    });
  const current = transitionRecoveryEpoch(existing, "complete", {
    winner,
    clusterId,
    membership,
    completedAt: now().toISOString(),
  });
  setCurrent(current);
  await persist(current, existing.epoch);
  await publishEvent({
    type: "recovery.bootstrap-complete",
    epoch: current.epoch,
    winner,
    membership,
  });
  return current;
}
