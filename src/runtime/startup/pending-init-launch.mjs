import { startPendingInitRuntime } from "../../lifecycle/pending-init/runtime.mjs";
import { startAuthorizedRecoveryJoin } from "../recovery/join/start.mjs";
import { executeAuthorizedRecoveryBootstrap } from "./bootstrap-execution.mjs";
import { startRecoveryRuntime } from "./runtime-launch.mjs";

export async function startPendingSupervisorRecovery(options) {
  const {
    startPendingRuntime = startPendingInitRuntime,
    startupDecision,
    startupServer,
    config,
    state,
    inspectDataDirectory,
    identity,
    args,
    recoveryState,
    recoveryAudit,
    recoveryResult,
    runtimeInputs,
    recoverJoiners,
    recoverTraffic,
    onRecoveryBootstrap,
    onRecoveryComplete,
    environment,
    log,
  } = options;
  const initializedData = inspectDataDirectory(config.dataDir).action === "start";
  let pendingRuntime;
  let temporaryListenersClosed = false;
  const closeTemporaryListeners = async () => {
    if (temporaryListenersClosed) return;
    temporaryListenersClosed = true;
    pendingRuntime?.shutdown?.();
    await startupServer?.close?.();
  };
  const startRuntime = (startupDecision) =>
    startRecoveryRuntime({ ...runtimeInputs, startupDecision });
  const onBootstrap = (bootstrap) =>
    executeAuthorizedRecoveryBootstrap({
      bootstrap,
      identity,
      args,
      state,
      recoveryState,
      closeTemporaryListeners,
      startRuntime,
      members: recoveryResult.members,
      recoverJoiners,
      recoverTraffic,
      onRecoveryBootstrap,
      log,
    });
  const onJoin = (request) =>
    startAuthorizedRecoveryJoin({
      request,
      identity,
      args,
      mariaProcess: state.mariaProcess,
      recoveryState,
      recoveryAudit,
      startRuntime: (options) => startRuntime(options.startupDecision),
      runtimeOptions: {},
    });
  pendingRuntime = await startPendingRuntime({
    environment,
    identity,
    logger: log,
    recoveryRequired: initializedData,
    recoveryReason: startupDecision.reason,
    recoveryProtocol: state.coldRecoveryProtocol,
    onRecoveryBootstrap: onBootstrap,
    onRecoveryComplete,
    onRecoveryJoin: onJoin,
  });
  log.warn("Supervisor startup is blocked. Pending recovery listener is active", {
    httpPort: config.httpPort,
    reason: startupDecision.reason,
  });
  return { pending: true };
}
