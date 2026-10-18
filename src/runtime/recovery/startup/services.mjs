import { createSupervisorColdRecovery } from "../../cold/recovery-wiring.mjs";
import { runWsrepRecover } from "../../wsrep-recovery.mjs";
import { resolveExplicitSupervisorStartup } from "../../startup/decision-wiring.mjs";
import { resolveCleanRestart } from "../../clean-restart/recovery.mjs";
import { startRecoveryEvidenceService } from "../evidence-service.mjs";
export async function prepareRecoveryStartupServices({
  startupConfiguration,
  config,
  identity,
  health,
  recoveryState,
  recoveryAudit,
  log,
  mariaProcess,
  getMariaProcess,
  environment,
  restartMarker,
  probes,
}) {
  const initialIntent = startupConfiguration.initialIntent,
    args = startupConfiguration.args;
  const services = {
    initialIntent,
    args,
    localEvidence: undefined,
    members: initialIntent.cluster.members,
    coldRecoveryProtocol: undefined,
    startupDecision: { mode: "standalone", reason: "single-node configuration" },
    recoveryCompletion: undefined,
    unifiedListener: false,
  };
  if (!config.elera) return services;
  const explicitStartup = await resolveExplicitSupervisorStartup({
    environment,
    nodeName: identity.name,
    dataDir: config.dataDir,
    args,
    joinAddress: initialIntent.cluster.members[0]?.address,
  });
  if (explicitStartup.explicit) {
    services.startupDecision = explicitStartup.decision;
    services.args = explicitStartup.args;
    return services;
  }
  const coldRecovery = createSupervisorColdRecovery({
    identity,
    config: {
      ...config,
      intent: { ...config.intent, cluster: initialIntent.cluster },
    },
    health,
    runRecover: runWsrepRecover,
    recoveryAudit,
    log,
    environment,
  });
  services.localEvidence = coldRecovery.evidence;
  services.members = coldRecovery.members;
  services.coldRecoveryProtocol = coldRecovery.protocol;
  services.needsPlan = true;
  recoveryState.set("collecting-evidence");
  const setStartupHandler = probes?.setStartupHandler;
  services.unifiedListener = typeof setStartupHandler === "function";
  const evidenceService = await startRecoveryEvidenceService({
    options: {
      identity,
      dataDir: config.dataDir,
      httpPort: config.httpPort,
      token: environment.ELERA_PEER_TOKEN ?? environment.ROOT_TOKEN,
      mariaProcess,
      getMariaProcess,
      log,
    },
    unifiedListener: services.unifiedListener,
    setStartupHandler,
    identity,
    httpPort: config.httpPort,
    log,
  });
  services.recoveryCompletion = evidenceService.completion;
  services.startupServer = evidenceService.server;
  services.startupDecision =
    (await resolveCleanRestart({
      restartMarker,
      recoveryProtocol: services.coldRecoveryProtocol,
      identity,
      startupTimeoutMs: config.startupTimeoutMs ?? 15000,
      log,
    })) ?? services.startupDecision;
  log.debug?.("Recovery phase: clean-restart decision evaluated", {
    node: identity.name,
    mode: services.startupDecision.mode,
    reason: services.startupDecision.reason,
  });
  if (services.startupDecision.mode === "join") {
    if (!services.unifiedListener) await services.startupServer.close();
    services.joined = true;
  }
  return services;
}
