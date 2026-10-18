import { startSupervisorRuntime } from "../runtime/start.mjs";
import { startSupervisorMariaDb } from "../maria/startup.mjs";

export async function startRecoveryRuntime(options) {
  const {
    dbEnv,
    probes,
    config,
    health,
    log,
    startupDecision,
    initialIntent,
    recoveryState,
    recoveryAudit,
    identity,
    routingEvent,
    routingBus,
    sharedRoutingAssignments,
    observationStore,
    getDrained,
    environment,
    state,
  } = options;
  const runtime = await startSupervisorRuntime({
    dbEnv,
    probes,
    config,
    health,
    log,
    startupDecision,
    initialIntent,
    recoveryState,
    recoveryAudit,
    identity,
    routingEvent,
    routingBus,
    sharedRoutingAssignments,
    observationStore,
    getDrained,
    environment,
    setDb: (db) => {
      state.db = db;
    },
  });
  state.routingTimer = runtime.routingTimer;
  state.peerTimer = runtime.peerTimer;
  return runtime;
}

export async function startOrdinarySupervisorRuntime(options) {
  const {
    startupDecision,
    recoveryResult,
    state,
    config,
    health,
    recoveryState,
    recoveryAudit,
    identity,
    log,
    recoverTraffic,
    runtimeInputs,
  } = options;
  startSupervisorMariaDb({
    processController: state.mariaProcess,
    config,
    startupDecision,
    health,
    recoveryState,
    recoveryAudit,
    recoveryCompletion: state.recoveryCompletion,
    coldRecoveryProtocol: state.coldRecoveryProtocol,
    startupServer: recoveryResult.startupServer,
    identity,
    signals: state.signals,
    log,
  });
  await startRecoveryRuntime({ ...runtimeInputs, startupDecision });
  await recoverTraffic();
  log.info("Elera supervisor started");
}
