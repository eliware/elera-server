import { createBootstrapWatch } from "../../cluster/cold-bootstrap/bootstrap-watch.mjs";
import { shouldStartMariaDb } from "../../cluster/cold-bootstrap/startup/state.mjs";
import { watchMariaDbBootstrapReadiness } from "./bootstrap-readiness.mjs";
import { watchMariaDbJoinReadiness } from "./join-readiness.mjs";

export function startSupervisorMariaDb({
  processController,
  config,
  startupDecision,
  health,
  recoveryState,
  recoveryAudit,
  recoveryCompletion,
  coldRecoveryProtocol,
  startupServer,
  identity,
  signals,
  log,
  createWatch = createBootstrapWatch,
  shouldStart = shouldStartMariaDb,
} = {}) {
  if (
    !processController ||
    typeof processController.start !== "function" ||
    !config ||
    !startupDecision ||
    typeof health?.status !== "function" ||
    !identity?.name ||
    !identity.name.includes(".") ||
    typeof log?.error !== "function"
  )
    throw new TypeError("MariaDB startup dependencies and shared FQDN identity are required");
  if (typeof recoveryState?.set !== "function" || typeof recoveryAudit?.failure !== "function")
    throw new TypeError("MariaDB recovery state and audit dependencies are required");
  const generation =
    startupDecision.generation ?? startupDecision.epoch ?? `${identity.name}:${Date.now()}`;
  const recoverySnapshot = () => recoveryState?.snapshot?.() ?? {};
  const isCurrent = () =>
    recoverySnapshot().generation === undefined || recoverySnapshot().generation === generation;
  if (
    !shouldStart({
      elera: config.elera,
      mode: startupDecision.mode,
      localWinner: startupDecision.localWinner,
      bootstrapComplete: startupDecision.bootstrapComplete,
    })
  ) {
    log.warn("MariaDB start refused until explicit recovery authority is available", {
      reason: startupDecision.reason,
    });
    return;
  }
  Promise.resolve()
    .then(() => processController.start())
    .then(() => {
      const shared = {
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
      };
      if (config.elera && ["join", "rejoin"].includes(startupDecision.mode))
        watchMariaDbJoinReadiness(shared);
      if (
        config.elera &&
        startupDecision.mode === "bootstrap" &&
        startupDecision.localWinner === true
      )
        watchMariaDbBootstrapReadiness({
          ...shared,
          recoveryCompletion,
          coldRecoveryProtocol,
          startupServer,
        });
    })
    .catch((error) => {
      log.error("Failed to start mariadbd", { error });
      void signals?.shutdown?.("mariadbd-error");
    });
}
