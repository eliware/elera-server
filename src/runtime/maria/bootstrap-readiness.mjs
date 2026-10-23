import { releaseRecoveryLease } from "./release-recovery-lease.mjs";

export function watchMariaDbBootstrapReadiness({
  createWatch,
  health,
  config,
  startupDecision,
  generation,
  recoveryState,
  recoveryAudit,
  recoveryCompletion,
  coldRecoveryProtocol,
  processController,
  startupServer,
  log,
  identity,
  isCurrent,
  recoveryLease,
}) {
  void createWatch({
    health,
    timeoutMs: config.startupTimeoutMs,
    isReady: (result) =>
      result.values?.wsrep_local_state_comment === "Synced" &&
      result.values?.wsrep_ready === "ON" &&
      result.values?.wsrep_cluster_status === "Primary" &&
      Number(result.values?.wsrep_cluster_size) === 1,
    onTimeout: async () => {
      if (!isCurrent()) return;
      recoveryState.set("cluster-unavailable", {
        reason: "bootstrap did not find an available Primary view before timeout",
        epoch: startupDecision.epoch,
        generation,
      });
      recoveryAudit.failure({
        reason: "bootstrap readiness timeout",
        epoch: startupDecision.epoch,
      });
      recoveryCompletion?.publish({
        epoch: startupDecision.epoch,
        status: "failed",
        reason: "bootstrap readiness timeout",
      });
      await processController.stop(config.shutdownTimeoutMs);
      await startupServer?.close();
    },
  })()
    .then(async (result) => {
      if (!result.ready) return;
      if (startupDecision.recoveryEpoch)
        await coldRecoveryProtocol?.complete({
          epoch: startupDecision.epoch,
          clusterId: startupDecision.recoveryEpoch.clusterId,
          winner: identity.name,
          membership: startupDecision.recoveryEpoch.quorum,
        });
      if (!isCurrent()) return;
      recoveryState.set("complete", {
        reason: startupDecision.recoveryEpoch
          ? "bootstrap completed with expected Primary membership"
          : "explicit bootstrap completed with expected Primary membership",
        epoch: startupDecision.epoch,
        generation,
      });
      if (typeof recoveryCompletion?.publish === "function" && startupDecision.epoch)
        recoveryCompletion.publish({
          epoch: startupDecision.epoch,
          status: "complete",
          clusterId: startupDecision.recoveryEpoch?.clusterId,
          winner: identity.name,
        });
      recoveryAudit.completion?.({ epoch: startupDecision.epoch, winner: identity.name });
      await releaseRecoveryLease(recoveryLease, log);
      await startupServer?.close();
    })
    .catch((error) => {
      if (!isCurrent() || recoveryState.snapshot?.().state === "complete") return;
      recoveryState.set("cluster-unavailable", {
        reason: error.message,
        epoch: startupDecision.epoch,
        generation,
      });
      recoveryAudit.failure({ reason: error.message, epoch: startupDecision.epoch });
      log.error("MariaDB bootstrap readiness failed", { error });
    });
}
