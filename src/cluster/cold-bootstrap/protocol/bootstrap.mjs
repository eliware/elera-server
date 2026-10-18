import { createRecoveryEpoch } from "../recovery/epoch/create.mjs";
import { transitionRecoveryEpoch } from "../recovery/epoch.mjs";
import { validateRecoveryEpoch } from "../recovery/epoch/validation.mjs";

export async function beginRecoveryBootstrap(
  { epoch, winner } = {},
  { read, persist, collect, now, publishEvent, debug, setCurrent },
) {
  debug("Start approved bootstrap", { epoch, winner });
  const existing = await read();
  if (!existing || existing.epoch !== epoch || !validateRecoveryEpoch(existing, existing.clusterId))
    throw Object.assign(new Error("unknown or stale recovery epoch"), { statusCode: 409 });
  if (existing.phase !== "authorized" || winner !== existing.winner.node)
    throw Object.assign(new Error("bootstrap authority does not match the recovery epoch"), {
      statusCode: 409,
    });
  let latest;
  try {
    ({ evidence: latest } = await collect());
  } catch (error) {
    const current = {
      ...existing,
      phase: "blocked",
      reason: error.message,
      code: error.code ?? "RECOVERY_EVIDENCE_UNAVAILABLE",
      updatedAt: now().toISOString(),
    };
    setCurrent(current);
    await persist(current, existing.epoch);
    await publishEvent({
      type: "recovery.refused",
      epoch,
      reason: current.reason,
      code: current.code,
    });
    throw Object.assign(new Error("bootstrap authority could not be revalidated"), {
      statusCode: 409,
      cause: error,
    });
  }
  const refreshed = createRecoveryEpoch({
    clusterId: existing.clusterId,
    evidence: latest,
    winner: existing.winner,
    quorum: existing.quorum,
    now: now(),
  });
  if (refreshed.evidenceDigest !== existing.evidenceDigest) {
    const current = {
      ...existing,
      phase: "blocked",
      reason: "recovery data changed after authorization",
      code: "RECOVERY_EVIDENCE_CHANGED",
      evidence: latest,
      updatedAt: now().toISOString(),
    };
    setCurrent(current);
    await persist(current, existing.epoch);
    await publishEvent({
      type: "recovery.refused",
      epoch,
      reason: current.reason,
      code: current.code,
    });
    throw Object.assign(new Error(current.reason), { statusCode: 409, code: current.code });
  }
  const current = transitionRecoveryEpoch(existing, "bootstrapping", {
    bootstrapStartedAt: now().toISOString(),
  });
  setCurrent(current);
  await persist(current, existing.epoch);
  await publishEvent({ type: "recovery.bootstrap-started", epoch: current.epoch, winner });
  return current;
}
