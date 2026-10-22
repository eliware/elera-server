import { saveBlockedRecoveryPlan } from "./blocked-plan.mjs";
import { createCandidateRecoveryPlan } from "./candidate-plan.mjs";

export function createRecoveryPlanner({
  nodes,
  collect,
  isActivePrimary,
  now,
  persist,
  publishEvent,
  debug,
  setCurrent,
}) {
  async function blocked(args) {
    const result = await saveBlockedRecoveryPlan({
      now,
      persist,
      publishEvent,
      setCurrent,
      ...args,
    });
    return result;
  }
  async function plan() {
    debug("Evaluating recovery plan");
    let evidence;
    let failures = [];
    try {
      const collected = await collect();
      evidence = collected.evidence;
      failures = collected.failures ?? [];
    } catch (error) {
      return blocked({
        reason: error.message,
        code: error.code ?? "RECOVERY_EVIDENCE_UNAVAILABLE",
      });
    }
    await publishEvent({ type: "recovery.evidence-collected", evidence });
    const active = evidence.find((item) => isActivePrimary(item, evidence));
    if (active)
      return {
        eligible: true,
        mode: "join",
        reason: "primary component previously exists",
        ...(Number.isInteger(active.galera.clusterSize) && active.galera.clusterSize > 0
          ? { expectedMembership: active.galera.clusterSize }
          : {}),
        evidence,
      };
    const requiredEvidence = Math.floor(nodes.length / 2) + 1;
    const mismatch = failures.find(
      (failure) => failure?.code === "RECOVERY_EVIDENCE_IDENTITY_MISMATCH",
    );
    if (evidence.length < requiredEvidence || mismatch) {
      const reason = mismatch?.message ?? "recovery data does not contain a validated majority";
      return blocked({
        reason,
        code: mismatch?.code ?? "INSUFFICIENT_RECOVERY_EVIDENCE",
        evidence,
        failures,
      });
    }
    return createCandidateRecoveryPlan({
      nodes,
      evidence,
      now,
      persist,
      publishEvent,
      debug,
      setCurrent,
      blocked,
    });
  }
  return { plan };
}
