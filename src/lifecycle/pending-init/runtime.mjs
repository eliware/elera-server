import { log, registerHandlers, registerSignals } from "@eliware/common";
import { createClusterHandoff } from "./handoff.mjs";
import { createPendingInitRuntimeServices, listenPendingInitServer } from "./runtime-services.mjs";

export const startPendingInitRuntime = ({
  environment = process.env,
  identity: runtimeIdentityValue,
  listen = (server, port, host) => server.listen(port, host),
  close = (server, callback) => server.close(callback),
  spawnProcess,
  exit,
  logger = log,
  recoveryRequired = false,
  recoveryReason = "recovery data is unavailable",
  recoveryProtocol,
  onRecoveryBootstrap = () => {},
  onRecoveryComplete = () => {},
  onRecoveryJoin = () => {},
  recoveryRetryIntervalMs = 1000,
  createServerImpl,
  createEvidenceImpl,
  createResetImpl,
  createHandoffImpl = createClusterHandoff,
} = {}) => {
  if (!runtimeIdentityValue?.name)
    throw new TypeError("shared runtime identity is required for pending initialization");
  const errorHandlers = registerHandlers({ events: ["uncaughtException", "unhandledRejection"] });
  let shuttingDown = false;
  const state = { listenerClosed: false, retryTimer: undefined };
  const closePending = () => closePendingListener(state, { close, server: pending.server, logger });
  const handoff = (bootstrapCluster) =>
    createHandoffImpl({ environment, spawnProcess, exit, bootstrapCluster });
  const identity = runtimeIdentityValue;
  const services = createPendingInitRuntimeServices({
    environment,
    identity,
    logger,
    recoveryRequired,
    recoveryReason,
    recoveryProtocol,
    createServerImpl,
    createEvidenceImpl,
    createResetImpl,
    onRecoveryJoin,
    onRecoveryBootstrap,
    onRecoveryComplete,
    closePending,
    handoff,
  });
  const pending = { server: services.server };
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    if (state.retryTimer) clearInterval(state.retryTimer);
    if (state.listenerClosed) return errorHandlers.removeHandlers();
    state.listenerClosed = true;
    try {
      close(pending.server, () => errorHandlers.removeHandlers());
    } catch (error) {
      errorHandlers.removeHandlers();
      throw error;
    }
  };
  const signals = registerSignals({ log: logger, shutdownHook: shutdown, exitCode: 0 });
  listenPendingInitServer({
    listen,
    server: pending.server,
    port: Number(environment.ELERA_HTTP_PORT ?? 8080),
    errorHandlers,
    logger,
  });
  if (recoveryRequired && typeof recoveryProtocol?.retry === "function") {
    state.retryTimer = setInterval(
      () => {
        Promise.resolve(recoveryProtocol.retry()).catch((error) =>
          logger.warn?.("Automatic recovery data retry failed", { error }),
        );
      },
      Math.max(250, recoveryRetryIntervalMs),
    );
    state.retryTimer.unref?.();
  }
  const stop = () => {
    if (state.retryTimer) clearInterval(state.retryTimer);
    shutdown();
  };
  return { server: pending.server, signals, shutdown: stop };
};

export function closePendingListener(state, { close, server, logger }) {
  if (state.listenerClosed) return;
  state.listenerClosed = true;
  if (state.retryTimer) clearInterval(state.retryTimer);
  try {
    close(server);
  } catch (error) {
    logger.warn?.("Pending recovery listener close failed", { error });
  }
}
