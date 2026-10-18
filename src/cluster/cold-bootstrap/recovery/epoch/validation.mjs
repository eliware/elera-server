export function validateRecoveryEpoch(epoch, expectedClusterId) {
  if (
    !epoch ||
    epoch.version !== 1 ||
    epoch.clusterId !== expectedClusterId ||
    !epoch.evidenceDigest ||
    !epoch.winner?.node ||
    !Array.isArray(epoch.quorum) ||
    epoch.phase === "blocked"
  )
    return false;
  return epoch.epoch === `${epoch.clusterId}:${epoch.evidenceDigest}`;
}
