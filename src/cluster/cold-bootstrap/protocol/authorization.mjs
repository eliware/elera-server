import { transitionRecoveryEpoch } from "../recovery/epoch.mjs";
import { validateRecoveryEpoch } from "../recovery/epoch/validation.mjs";

export async function authorizeRecoveryEpoch(
  { epoch, acknowledgements = [], force = false, supervisorQuorum } = {},
  { read, persist, now, publishEvent, debug, setCurrent },
) {
  debug("Authorizing recovery epoch", { epoch, acknowledgements, force, supervisorQuorum });
  const existing = await read();
  if (!existing || existing.epoch !== epoch || !validateRecoveryEpoch(existing, existing.clusterId))
    throw Object.assign(new Error("unknown or stale recovery epoch"), { statusCode: 409 });
  const requestedQuorum = supervisorQuorum ?? existing.quorum.length;
  if (
    !Number.isInteger(requestedQuorum) ||
    requestedQuorum < 1 ||
    requestedQuorum > existing.quorum.length
  )
    throw Object.assign(
      new Error("supervisor quorum must be between one and the configured member count"),
      { statusCode: 400 },
    );
  const acknowledgementsBy =
    force && supervisorQuorum === undefined
      ? existing.quorum.slice()
      : [...new Set(Array.isArray(acknowledgements) ? acknowledgements : [])].sort();
  const current = transitionRecoveryEpoch(existing, "authorized", {
    acknowledgements: acknowledgementsBy,
    acknowledgementsBy,
    requiredAcknowledgements: requestedQuorum,
    ...(force ? { operatorForced: true } : {}),
    authorizedAt: now().toISOString(),
  });
  setCurrent(current);
  await persist(current, existing.epoch);
  await publishEvent({
    type: "recovery.bootstrap-authorized",
    epoch: current.epoch,
    acknowledgements: acknowledgementsBy,
  });
  return current;
}
