import { prepareRecoveryStartupServices } from "./startup/services.mjs";
import { resolveSupervisorStartupPlan } from "./startup/plan.mjs";

const replacementOrCurrent = (current, replacement = current) => replacement;

export async function prepareSupervisorRecovery({
  startupConfiguration,
  intentState,
  config,
  identity,
  health,
  recoveryState,
  recoveryAudit,
  log,
  mariaProcess,
  getMariaProcess = () => mariaProcess?.mariaProcess ?? mariaProcess,
  environment = process.env,
  restartMarker,
  probes,
} = {}) {
  log.debug?.("Recovery phase: preparing startup decision", {
    node: identity.name,
    clusterMode: config.elera,
    dataDir: config.dataDir,
  });
  const services = await prepareRecoveryStartupServices({
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
  });
  let { args, startupDecision } = services;
  if (services.joined)
    return {
      initialIntent: services.initialIntent,
      args,
      localEvidence: services.localEvidence,
      members: services.members,
      coldRecoveryProtocol: services.coldRecoveryProtocol,
      startupDecision,
      recoveryCompletion: services.recoveryCompletion,
      startupServer: services.startupServer,
    };
  if (services.needsPlan) {
    const resolved = await resolveSupervisorStartupPlan({
      recoveryProtocol: services.coldRecoveryProtocol,
      startupTimeoutMs: config.startupTimeoutMs ?? 15000,
      identity,
      recoveryState,
      recoveryAudit,
      environment,
      members: services.members,
      config,
      intentState,
      log,
      startupServer: services.startupServer,
      unifiedListener: services.unifiedListener,
    });
    startupDecision = resolved.decision;
    args = replacementOrCurrent(args, resolved.args);
  }
  return {
    initialIntent: services.initialIntent,
    args,
    localEvidence: services.localEvidence,
    members: services.members,
    coldRecoveryProtocol: services.coldRecoveryProtocol,
    startupDecision,
    recoveryCompletion: services.recoveryCompletion,
    startupServer: services.startupServer,
  };
}
