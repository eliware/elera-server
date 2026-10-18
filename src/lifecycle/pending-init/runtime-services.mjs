import { createPendingInitServer } from "./server.mjs";
import { createNodeDataReset } from "../node/data-reset.mjs";
import { createStartupLocalEvidence } from "../../cluster/cold-bootstrap/startup/local-evidence.mjs";
import { readStateFile } from "../../cluster/cold-bootstrap/state-file.mjs";
import { inspectDataDirectory } from "../data/directory.mjs";
import { runWsrepRecover } from "../../runtime/wsrep-recovery.mjs";

export function createPendingInitRuntimeServices({
  environment,
  identity,
  logger,
  recoveryRequired,
  recoveryReason,
  recoveryProtocol,
  onRecoveryBootstrap,
  onRecoveryComplete,
  onRecoveryJoin,
  createServerImpl = createPendingInitServer,
  createEvidenceImpl = createStartupLocalEvidence,
  createResetImpl = createNodeDataReset,
  closePending,
  handoff,
}) {
  const coldEvidence = createEvidenceImpl({
    node: identity,
    dataDir: environment.MARIADB_DATA_DIR ?? "/var/lib/mysql",
    readState: (directory) => readStateFile(directory),
    runRecover: runWsrepRecover,
    inspect: inspectDataDirectory,
  });
  const nodeDataReset = createResetImpl({
    node: identity.name,
    dataDir: environment.MARIADB_DATA_DIR ?? "/var/lib/mysql",
    getStatus: async () => {
      throw new Error("SQL unavailable during pending recovery");
    },
    offlineRecovery: true,
    getRecoveryState: () => ({ state: "pending" }),
    audit: logger,
  });
  const createdServer = createServerImpl({
    environment,
    identity,
    log: logger,
    nodeDataReset,
    coldEvidence,
    recoveryRequired,
    recoveryReason,
    recoveryProtocol,
    onRecoveryJoin: async (data) => {
      const result = await onRecoveryJoin(data);
      closePending();
      return result;
    },
    onRecoveryBootstrap: async (data) => {
      const result = await onRecoveryBootstrap(data);
      if (result !== false) closePending();
    },
    onRecoveryComplete,
    onInitialized: (operation) => {
      if (operation === "join-pending") return;
      closePending();
      void handoff(operation === "bootstrap")().catch((error) =>
        logger.error?.("Pending initialization handoff failed", { error }),
      );
    },
  });
  const server = createdServer?.server ?? createdServer;
  return { coldEvidence, nodeDataReset, server };
}

export function listenPendingInitServer({ listen, server, port, errorHandlers, logger }) {
  try {
    const listening = listen(server, port, "0.0.0.0");
    if (listening && typeof listening.then === "function") {
      listening.catch((error) => {
        errorHandlers.removeHandlers();
        logger.error?.("Pending recovery listener failed to start", { error });
      });
    }
  } catch (error) {
    errorHandlers.removeHandlers();
    throw error;
  }
}
