import { startAuthorizedRecoveryProcess } from "../recovery/process-start.mjs";

export async function executeAuthorizedRecoveryBootstrap({
  bootstrap,
  identity,
  args,
  state,
  recoveryState,
  closeTemporaryListeners,
  startRuntime,
  members,
  recoverJoiners,
  recoverTraffic,
  onRecoveryBootstrap,
  log,
}) {
  log.debug?.("Recovery phase: approved bootstrap handoff requested", { bootstrap });
  const localWinner = await startAuthorizedRecoveryProcess({
    bootstrap,
    identity,
    args,
    mariaProcess: state.mariaProcess,
    recoveryState,
    onRecoveryBootstrap,
  });
  if (!localWinner) return false;
  await closeTemporaryListeners();
  log.debug?.("Recovery phase: temporary listeners closed. Starting winner runtime", {
    epoch: bootstrap?.epoch,
  });
  const runtime = await startRuntime({
    mode: "bootstrap",
    localWinner: true,
    epoch: bootstrap?.epoch,
    recoveryEpoch: {
      clusterId: bootstrap?.clusterId,
      quorum: bootstrap?.quorum ?? members.map((member) => member.name),
    },
  });
  await recoverJoiners({ bootstrap, members, runtime });
  log.debug?.("Recovery phase: sequential joiners completed", { epoch: bootstrap?.epoch });
  await recoverTraffic();
  return onRecoveryBootstrap(bootstrap);
}
