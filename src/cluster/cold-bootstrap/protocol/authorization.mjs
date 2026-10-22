import { transitionRecoveryEpoch } from "../recovery/epoch.mjs";
import { validateRecoveryEpoch } from "../recovery/epoch/validation.mjs";

export async function authorizeRecoveryEpoch(
  { epoch, leaseClaims = [], force = false, supervisorQuorum } = {},
  { read, persist, now, publishEvent, debug, setCurrent },
) {
  debug("Authorizing recovery epoch", { epoch, force, supervisorQuorum });
  const existing = await read();
  if (!existing || existing.epoch !== epoch || !validateRecoveryEpoch(existing, existing.clusterId))
    throw Object.assign(new Error("unknown or stale recovery epoch"), { statusCode: 409 });
  const requestedQuorum = existing.quorum.length;
  if (
    (supervisorQuorum !== undefined && supervisorQuorum !== requestedQuorum) ||
    !Number.isInteger(requestedQuorum) ||
    requestedQuorum < 1
  )
    throw Object.assign(new Error("supervisor quorum must match the configured member count"), {
      statusCode: 400,
    });
  const acknowledgementsBy = verifiedLeaseMembers(leaseClaims, existing);
  const current = transitionRecoveryEpoch(existing, "authorized", {
    acknowledgements: acknowledgementsBy,
    acknowledgementsBy,
    requiredAcknowledgements: requestedQuorum,
    ...(force ? { operatorForced: true } : {}),
    authorizedAt: now().toISOString(),
  });
  await persist(current, existing.epoch);
  setCurrent(current);
  await publishEvent({
    type: "recovery.bootstrap-authorized",
    epoch: current.epoch,
    acknowledgements: acknowledgementsBy,
  });
  return current;
}

function verifiedLeaseMembers(claims, epoch) {
  if (!Array.isArray(claims))
    throw new TypeError("authenticated recovery lease claims are required");
  if (
    claims.some(
      (claim) =>
        claim?.authenticated !== true ||
        claim.granted !== true ||
        claim.epoch !== epoch.epoch ||
        claim.winner !== epoch.winner.node,
    )
  )
    throw Object.assign(new Error("recovery authorization contains an invalid lease claim"), {
      statusCode: 403,
    });
  return claims.map((claim) => claim.member).sort();
}
