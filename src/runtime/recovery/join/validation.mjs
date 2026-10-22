export function validateRecoveryJoinerDependencies({ identity, timeoutMs, fetchImpl }) {
  if (!identity?.name || !identity.name.includes("."))
    throw new TypeError("recovery joiner requires a shared FQDN identity");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || typeof fetchImpl !== "function")
    throw new TypeError("recovery joiner timeout and fetch dependencies are required");
}

export function validateRecoveryJoinRequest(identity, { bootstrap, members = [] } = {}) {
  if (
    !Array.isArray(members) ||
    members.length < 2 ||
    members.some((member) => !member?.name?.includes(".") || !member.address?.includes("."))
  )
    throw new TypeError("recovery join members must use FQDN identities and addresses");
  const winnerName =
    typeof bootstrap?.winner === "string"
      ? bootstrap.winner
      : (bootstrap?.winner?.node ?? bootstrap?.winner?.name);
  const winner = members.find((member) => member.name === winnerName);
  if (!winner || winner.name === identity.name || !winner.address)
    throw Object.assign(
      new Error("recovery join requires a non-local winner with an FQDN address"),
      { code: "RECOVERY_JOIN_WINNER_REQUIRED" },
    );
  if (!members.some((member) => member.name === identity.name))
    throw new Error(`runtime identity ${identity.name} is not a configured recovery join member`);
  return { members, winner };
}
