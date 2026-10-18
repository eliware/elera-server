import { loadSupervisorConfig } from "../config.mjs";
import { createCleanRestartMarker } from "./clean-restart/marker.mjs";
import { supervisorDbEnvironment } from "./db-environment.mjs";
import { createSupervisorEntryComposition } from "./entry/composition.mjs";
import { runtimeIdentity } from "./identity.mjs";
import { createRuntimeState } from "./runtime/state.mjs";

export function createSupervisorApplicationContext({
  environment = process.env,
  log,
  getIdentity = runtimeIdentity,
  loadConfig = loadSupervisorConfig,
  getDbEnvironment = supervisorDbEnvironment,
  createState = createRuntimeState,
  createComposition = createSupervisorEntryComposition,
  createRestartMarker = createCleanRestartMarker,
} = {}) {
  const identity = getIdentity();
  const config = loadConfig(environment, undefined, identity);
  const dbEnv = getDbEnvironment();
  const state = {
    db: undefined,
    drained: false,
    shuttingDown: false,
    restarting: false,
    bootstrapMaria: undefined,
    coldBootstrapLocal: undefined,
    coldBootstrapService: undefined,
    coldEvidence: undefined,
    coldRecoveryProtocol: undefined,
    peerTimer: undefined,
    routingTimer: undefined,
    mariaProcess: undefined,
    recoveryCompletion: undefined,
    applyIntent: undefined,
    signals: undefined,
  };
  const servers = [];
  const { lifecycle, telemetry, recoveryState, recovery, recoveryAudit } = createState({
    config,
    log,
  });
  const stateDir = environment.ELERA_CONFIG_STATE_DIR ?? `${config.dataDir}/elera-state`;
  const restartMarker = createRestartMarker({
    path: `${stateDir}/clean-restart.json`,
    node: identity.name,
    epoch: null,
  });
  let composition;
  composition = createComposition({
    config,
    identity,
    lifecycle,
    telemetry,
    recoveryState,
    recovery,
    log,
    restartMarker,
    getDb: () => state.db,
    setDrained: (value) => {
      state.drained = value;
    },
    getDrained: () => state.drained,
    getTimers: () => [state.peerTimer, state.routingTimer],
    getMariaProcess: () => state.mariaProcess,
    getColdState: () => ({
      drain: {
        isDraining: () => composition.traffic.drain.isDraining(),
        active: () => composition.traffic.drain.active(),
      },
      clusterDrain: { set: (...args) => composition.traffic.clusterDrain.set(...args) },
      bootstrapMaria: () => state.bootstrapMaria,
      coldBootstrapService: () => state.coldBootstrapService,
      coldEvidence: () => state.coldEvidence,
      coldRecoveryProtocol: () => state.coldRecoveryProtocol,
      coldBootstrapLocal: () => state.coldBootstrapLocal,
    }),
    applyIntent: (intent) => state.applyIntent(intent),
    servers,
  });
  const signals = composition.lifecycleWiring({}).signals;
  state.applyIntent = (intent) => composition.intentState.apply(intent);
  state.signals = signals;
  return {
    identity,
    config,
    dbEnv,
    state,
    restartMarker,
    composition,
    servers,
    telemetry,
    recoveryState,
    recovery,
    recoveryAudit,
  };
}
