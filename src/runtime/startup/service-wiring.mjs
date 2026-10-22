import { createSupervisorStartupServices } from "./services.mjs";
import { createSupervisorColdBootstrap } from "../cold/bootstrap-wiring.mjs";

export function wireSupervisorStartupServices(options) {
  const {
    recoveryResult,
    state,
    config,
    environment,
    log,
    args,
    recoveryState,
    recoveryAudit,
    health,
    loadEnvironmentIntent,
    intentState,
  } = options;
  const { localEvidence, members } = recoveryResult;
  const { startupDecision } = recoveryResult;
  state.coldRecoveryProtocol = recoveryResult.coldRecoveryProtocol;
  state.recoveryCompletion = recoveryResult.recoveryCompletion;
  state.coldEvidence = localEvidence?.local;
  if (config.elera && startupDecision.mode === "bootstrap" && startupDecision.localWinner === true)
    recoveryState.set("bootstrapping", { epoch: startupDecision.epoch });
  log.info("Startup recovery decision completed", {
    mode: startupDecision.mode,
    winner: startupDecision.winner,
    epoch: startupDecision.epoch,
    reason: startupDecision.reason,
  });
  state.coldBootstrapService =
    config.elera && localEvidence
      ? createSupervisorColdBootstrap({
          members,
          localEvidence: localEvidence?.local,
          remoteEvidence: localEvidence?.remote,
          bootstrapLocal: () => state.coldBootstrapLocal?.(),
          config,
          environment,
          log,
        })
      : undefined;
  const services = createSupervisorStartupServices({
    args,
    config,
    log,
    recoveryState,
    recoveryAudit,
    isRestarting: () => state.restarting,
    setRestarting: (value) => {
      state.restarting = value;
    },
    onFatal: (code) => process.exit(code ?? 1),
    health,
    loadIntent: loadEnvironmentIntent,
    intentState,
    environment,
    shuttingDown: () => state.shuttingDown,
  });
  state.mariaProcess = services.processController;
  state.coldBootstrapLocal = services.bootstrapLocal;
  state.applyIntent = services.applyIntent;
  state.bootstrapMaria = services.bootstrapMaria;
  return services;
}
