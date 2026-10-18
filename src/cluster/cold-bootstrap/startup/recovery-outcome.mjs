import { selectCandidate } from "../candidate.mjs";
import { createRecoveryEpoch } from "../recovery/epoch/create.mjs";

export function resolveStartupRecoveryOutcome({ nodes, results, epoch }) {
  const states = results.flatMap((result, index) =>
    result.status === "fulfilled"
      ? [result.value].map((value) => {
          const state = value?.state ?? value;
          const actualNode = value?.node ?? state?.node;
          if (actualNode !== nodes[index].name) {
            throw Object.assign(
              new Error(
                `recovery data identity mismatch: expected ${nodes[index].name}, received ${actualNode ?? "none"}`,
              ),
              { code: "RECOVERY_EVIDENCE_IDENTITY_MISMATCH" },
            );
          }
          return {
            ...state,
            node: actualNode,
            dataDirectory: value?.dataDirectory,
            galera: value?.galera ?? state?.galera,
            active: value?.active ?? state?.active,
            generation: value?.generation,
            observedAt: value?.observedAt,
          };
        })
      : [],
  );
  const active = states.some(
    (item) =>
      item.active === true &&
      item.galera?.clusterStatus === "Primary" &&
      item.galera.localState === "Synced" &&
      (item.galera.ready === "ON" || item.galera.ready === true),
  );
  if (active)
    return {
      mode: "join",
      reason: "primary component previously exists",
      epoch: null,
      bootstrapComplete: true,
      evidence: states,
    };
  const failed = results.find((result) => result.status === "rejected");
  if (failed) throw failed.reason;
  const decision = selectCandidate(states);
  if (!decision.eligible)
    return { mode: "blocked", reason: decision.reason, epoch: null, evidence: states };
  const selectedState = decision.candidate;
  const recoveryEpoch = createRecoveryEpoch({
    clusterId: selectedState.uuid,
    evidence: states,
    winner: selectedState,
    quorum: nodes.map((node) => node.name),
  });
  const epochId = typeof epoch === "function" ? epoch(states) : recoveryEpoch.epoch;
  return {
    mode: "bootstrap",
    winner: selectedState.node,
    localWinner: selectedState.node === nodes.find((node) => node.local)?.name,
    reason: decision.reason,
    epoch: epochId,
    recoveryEpoch: { ...recoveryEpoch, epoch: epochId },
    evidence: states,
  };
}
