import { createRecoveryJoinClient } from "./client.mjs";
import { recoverJoinersSequentially } from "../../sequential-joiners.mjs";
import { validateRecoveryJoinerDependencies, validateRecoveryJoinRequest } from "./validation.mjs";
import { verifyRecoveryJoiner } from "./verify-status.mjs";

export function createSupervisorRecoveryJoiner({
  identity,
  token,
  timeoutMs,
  httpPort = 8080,
  recoveryState,
  recoveryAudit,
  publishRecovery = async () => {},
  log,
  fetchImpl = fetch,
} = {}) {
  validateRecoveryJoinerDependencies({ identity, timeoutMs, fetchImpl });
  const client = createRecoveryJoinClient({ token, timeoutMs, fetchImpl });
  return (request = {}) => {
    const { bootstrap } = request;
    const { members, winner } = validateRecoveryJoinRequest(identity, request);
    return recoverJoinersSequentially({
      joiners: members.filter((member) => member.name !== identity.name),
      startJoiner: (joiner) =>
        client.join({
          ...joiner,
          url: joiner.url ?? `http://${joiner.address}:${httpPort}`,
          winnerAddress: winner?.address,
          epoch: bootstrap?.epoch,
          clusterId: bootstrap?.clusterId,
          quorum: bootstrap?.quorum ?? members.map((member) => member.name),
        }),
      verifyJoiner: (joiner) =>
        verifyRecoveryJoiner({
          joiner,
          fetchImpl,
          token,
          timeoutMs,
          bootstrap,
          members,
          httpPort,
        }),
      epoch: bootstrap?.epoch,
      recoveryState,
      recoveryAudit,
      publishRecovery,
      log,
    });
  };
}
