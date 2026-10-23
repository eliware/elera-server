import { releaseRecoveryLease } from "./release-recovery-lease.mjs";

export function watchMariaDbJoinReadiness({
  createWatch,
  health,
  config,
  startupDecision,
  generation,
  recoveryState,
  recoveryAudit,
  processController,
  log,
  identity,
  isCurrent,
  recoveryLease,
}) {
  recoveryState.set("joining", {
    reason: startupDecision.reason,
    generation,
    epoch: startupDecision.epoch,
  });
  recoveryAudit.joinStart({ node: identity.name, epoch: startupDecision.epoch });
  const minimumMembership = startupDecision.expectedMembership ?? 2;
  const isReady = (result) =>
    result.values?.wsrep_local_state_comment === "Synced" &&
    result.values?.wsrep_ready === "ON" &&
    result.values?.wsrep_cluster_status === "Primary" &&
    Number(result.values?.wsrep_cluster_size) >= minimumMembership;
  void createWatch({
    health,
    timeoutMs: config.startupTimeoutMs,
    isReady,
    onTimeout: async () => {
      if (!isCurrent()) return;
      recoveryState.set("cluster-unavailable", {
        reason: "join did not find an available Primary view before timeout",
        epoch: startupDecision.epoch,
        generation,
      });
      recoveryAudit.failure({ reason: "join readiness timeout", epoch: startupDecision.epoch });
      if (startupDecision.mode === "join") await processController.stop(config.shutdownTimeoutMs);
    },
  })()
    .then(async (result) => {
      if (!result.ready) return;
      if (
        !isCurrent() ||
        !(await health
          .status()
          .then(isReady)
          .catch(() => false))
      )
        return;
      recoveryState.set("complete", {
        reason: "join completed with expected Primary membership",
        epoch: startupDecision.epoch,
        generation,
      });
      recoveryAudit.completion?.({ node: identity.name, epoch: startupDecision.epoch });
      await releaseRecoveryLease(recoveryLease, log);
    })
    .catch((error) => {
      if (!isCurrent() || recoveryState.snapshot?.().state === "complete") return;
      recoveryState.set("cluster-unavailable", {
        reason: error.message,
        epoch: startupDecision.epoch,
        generation,
      });
      recoveryAudit.failure({ reason: error.message, epoch: startupDecision.epoch });
      log.error("MariaDB join readiness failed", { error });
    });
}
