import { startPendingSupervisorRecovery } from "./pending-init-launch.mjs";
import { startOrdinarySupervisorRuntime } from "./runtime-launch.mjs";
import { prepareSupervisorStartup } from "./recovery-preparation.mjs";
import { wireSupervisorStartupServices } from "./service-wiring.mjs";
import { inspectDataDirectory } from "../../lifecycle/data/directory.mjs";

export async function startSupervisor(options) {
  const {
    config,
    identity,
    log,
    loadEnvironmentIntent,
    intentState,
    routingEnvironment,
    recoveryState,
    recoveryAudit,
    health,
    environment = process.env,
    probes,
    observationStore,
    getDrained,
    recoverTraffic = async () => {},
    cleanRestartIntent,
    telemetry,
    state,
    startPendingRuntime,
    onRecoveryBootstrap = async () => {},
    onRecoveryComplete = async () => {},
    recoverJoiners = async () => {},
  } = options;
  const { recoveryResult } = await prepareSupervisorStartup({
    config,
    identity,
    log,
    loadEnvironmentIntent,
    intentState,
    routingEnvironment,
    recoveryState,
    recoveryAudit,
    health,
    environment,
    probes,
    cleanRestartIntent,
    telemetry,
    state,
    observationStore,
    getDrained,
    recoverTraffic,
  });
  const { initialIntent, args, startupDecision, startupServer } = recoveryResult;
  wireSupervisorStartupServices({
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
  });
  const runtimeInputs = { ...options, initialIntent };
  if (startupDecision.mode === "blocked") {
    log.debug?.("Recovery phase: entering pending control runtime", {
      reason: startupDecision.reason,
    });
    return startPendingSupervisorRecovery({
      ...runtimeInputs,
      startPendingRuntime,
      startupDecision,
      startupServer,
      inspectDataDirectory,
      args,
      recoveryResult,
      recoverJoiners,
      recoverTraffic,
      onRecoveryBootstrap,
      onRecoveryComplete,
      runtimeInputs,
    });
  }
  return startOrdinarySupervisorRuntime({
    ...runtimeInputs,
    startupDecision,
    recoveryResult,
    recoverTraffic,
    runtimeInputs,
  });
}
