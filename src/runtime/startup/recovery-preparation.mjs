import { loadSupervisorStartupConfiguration } from "./configuration.mjs";
import { prepareSupervisorRecovery } from "../recovery/startup.mjs";

export async function prepareSupervisorStartup(options) {
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
    environment,
    probes,
    cleanRestartIntent,
    telemetry,
    state,
    observationStore,
    getDrained,
    recoverTraffic,
  } = options;
  if (
    !config ||
    typeof config.elera !== "boolean" ||
    !identity?.name ||
    !identity.name.includes(".") ||
    typeof log?.info !== "function" ||
    typeof telemetry?.start !== "function" ||
    !state ||
    !recoveryState ||
    !recoveryAudit ||
    !health ||
    !observationStore
  )
    throw new TypeError(
      "supervisor startup requires validated config, state, recovery, health, observation, and shared FQDN identity",
    );
  if (typeof recoverTraffic !== "function" || typeof getDrained !== "function")
    throw new TypeError("supervisor traffic lifecycle dependencies are required");
  log.debug?.("Startup phase: telemetry and observation initialization");
  telemetry.start();
  await observationStore.initialize?.();
  log.info("Elera supervisor starting", { elera: config.elera, httpPort: config.httpPort });
  const startupConfiguration = await loadSupervisorStartupConfiguration({
    intentState,
    loadEnvironmentIntent,
    node: identity,
    identity,
    routingEnvironment,
    config,
    log,
    environment,
  });
  log.debug?.("Startup phase: recovery setup complete", {
    node: identity.name,
    clusterSize: config.clusterSize,
  });
  const recoveryResult = await prepareSupervisorRecovery({
    startupConfiguration,
    intentState,
    config,
    identity,
    health,
    recoveryState,
    recoveryAudit,
    log,
    mariaProcess: state,
    environment,
    restartMarker: cleanRestartIntent,
    probes,
  });
  return { startupConfiguration, recoveryResult };
}
