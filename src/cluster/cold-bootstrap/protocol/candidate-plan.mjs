import { selectCandidate } from "../candidate.mjs";
import { createRecoveryEpoch } from "../recovery/epoch/create.mjs";

export async function createCandidateRecoveryPlan({
  nodes,
  evidence,
  now,
  persist,
  publishEvent,
  debug,
  setCurrent,
  blocked,
}) {
  const decision = selectCandidate(evidence, {
    minimumHistorySize: Math.floor(nodes.length / 2) + 1,
  });
  debug("Recovery candidate decision complete", {
    eligible: decision.eligible,
    code: decision.code,
    reason: decision.reason,
    candidate: decision.candidate?.node,
    divergentCount: decision.divergent?.length ?? 0,
  });
  if (!decision.eligible)
    return blocked({ reason: decision.reason, code: decision.code, evidence });
  const epoch = createRecoveryEpoch({
    clusterId: decision.candidate.uuid,
    evidence,
    winner: decision.candidate,
    quorum: nodes.map((node) => node.name),
    now: now(),
  });
  const current = {
    ...epoch,
    evidence,
    divergent: decision.divergent,
    histories: decision.histories,
  };
  setCurrent(current);
  await persist(current);
  await publishEvent({
    type: "recovery.candidate-selected",
    epoch: epoch.epoch,
    winner: epoch.winner,
  });
  return { eligible: true, mode: "bootstrap", ...current };
}
