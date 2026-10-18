import { createSupervisorLifecycle } from "../lifecycle/composition.mjs";
import { closeServer } from "../server-lifecycle.mjs";
import { createSupervisorEntryServices } from "./services.mjs";
import { createSupervisorEntryWiring } from "./wiring.mjs";

export function createSupervisorEntryComposition({
  config,
  identity,
  lifecycle,
  telemetry,
  recoveryState,
  recovery,
  log,
  environment = process.env,
  getDb,
  setDrained,
  getDrained,
  getTimers,
  getMariaProcess,
  restartMarker,
  getColdState = () => ({}),
  applyIntent = (intent) => intent,
  servers = [],
}) {
  if (
    !config?.dataDir ||
    !identity?.name ||
    !identity.name.includes(".") ||
    typeof getDb !== "function" ||
    typeof telemetry?.summary !== "function" ||
    typeof recoveryState?.snapshot !== "function"
  )
    throw new TypeError(
      "entry composition requires validated config, shared FQDN identity, database, telemetry, and recovery state",
    );
  if (
    typeof setDrained !== "function" ||
    typeof getDrained !== "function" ||
    typeof getMariaProcess !== "function"
  )
    throw new TypeError("entry composition lifecycle dependencies are required");
  const services = createSupervisorEntryServices({
    config,
    identity,
    telemetry,
    recoveryState,
    log,
    environment,
    getDb,
    setDrained,
    getDrained,
  });
  const { health, domain, routing, routingStream, traffic } = services;
  const { control, probes } = createSupervisorEntryWiring({
    services,
    recovery,
    lifecycle,
    config,
    identity,
    getColdState,
    applyIntent,
    environment,
    log,
    getDb,
    getMariaProcess,
  });
  servers.push(probes);
  return {
    ...domain,
    ...routing,
    health,
    routingStream,
    traffic,
    probes,
    control,
    lifecycleWiring: ({ errors }) =>
      createSupervisorLifecycle({
        lifecycle,
        sqlQuiesce: traffic.sqlQuiesce,
        drain: traffic.drain,
        clusterDrain: traffic.clusterDrain,
        config,
        identity,
        observationStore: domain.observationStore,
        getTimers,
        routingBus: routing.routingBus,
        routingStream,
        telemetry,
        servers,
        closeServer,
        getMariaProcess,
        getDb,
        errors,
        log,
        restartMarker,
      }),
  };
}
