const phases = new Set(["evidence", "authorized", "bootstrapping", "complete", "blocked"]);
const transitions = new Map([
  ["evidence", new Set(["authorized", "blocked"])],
  ["authorized", new Set(["bootstrapping", "blocked"])],
  ["bootstrapping", new Set(["complete", "blocked"])],
  ["complete", new Set()],
  ["blocked", new Set(["evidence"])],
]);
export function transitionRecoveryEpoch(epoch, phase, details = {}) {
  if (!epoch || !phases.has(phase))
    throw new TypeError("valid recovery epoch and phase are required");
  if (phase !== epoch.phase && !transitions.get(epoch.phase)?.has(phase))
    throw Object.assign(new Error(`invalid recovery epoch change: ${epoch.phase} -> ${phase}`), {
      code: "INVALID_RECOVERY_EPOCH_TRANSITION",
    });
  if (phase === "authorized") {
    if (!Array.isArray(details.acknowledgements))
      throw new Error("recovery epoch requires identified quorum acknowledgements");
    const acknowledgements = new Set(details.acknowledgements);
    const members = new Set(epoch.quorum);
    const requiredAcknowledgements = details.requiredAcknowledgements ?? epoch.quorum.length;
    if (
      !Number.isInteger(requiredAcknowledgements) ||
      requiredAcknowledgements < 1 ||
      requiredAcknowledgements > members.size
    )
      throw new Error("recovery epoch requires a valid supervisor quorum");
    if (acknowledgements.size < requiredAcknowledgements)
      throw new Error(
        requiredAcknowledgements === members.size
          ? "recovery epoch lacks full-cluster authorization"
          : `recovery epoch lacks required supervisor quorum (${requiredAcknowledgements})`,
      );
    if ([...acknowledgements].some((node) => !members.has(node)))
      throw new Error("recovery epoch contains an unknown quorum member");
    if (acknowledgements.size !== details.acknowledgements.length)
      throw new Error("recovery epoch contains duplicate quorum acknowledgements");
    return { ...epoch, ...details, acknowledgements, phase, updatedAt: new Date().toISOString() };
  }
  if (phase === "complete" && details.clusterId !== epoch.clusterId)
    throw new Error("recovery end cluster identity mismatch");
  if (phase === "complete" && details.winner !== epoch.winner.node)
    throw new Error("recovery end winner mismatch");
  return { ...epoch, ...details, phase, updatedAt: new Date().toISOString() };
}
