import { promises as dns } from "node:dns";
import { createHealthService } from "../../health.mjs";
import { createSupervisorComposition } from "../composition.mjs";
import { createRoutingComposition } from "../routing/composition.mjs";
import { createRoutingStream } from "../../api/routing/stream.mjs";
import { createSupervisorTraffic } from "../traffic/wiring.mjs";
import { createColdBootstrapEvidence } from "../../cluster/cold-bootstrap/peer-evidence.mjs";
import { runWsrepRecover } from "../wsrep-recovery.mjs";

export function createSupervisorEntryServices({
  config,
  identity,
  telemetry,
  recoveryState,
  log,
  environment,
  getDb,
  setDrained,
  getDrained,
}) {
  const health = createHealthService({
    db: {
      query: (...args) => getDb()?.query?.(...args),
      health: (...args) => getDb()?.health?.(...args),
    },
    timeoutMs: config.timeoutMs,
    elera: config.elera,
    clusterSize: config.clusterSize,
    getTelemetry: () => telemetry.summary(),
    getRecoveryState: () => recoveryState.snapshot(),
    log,
  });
  const domain = createSupervisorComposition({
    query: (...args) => getDb()?.query?.(...args),
    identity,
    log,
  });
  const coldEvidence = createColdBootstrapEvidence({
    localNode: identity,
    dataDir: config.dataDir,
    health,
    token: environment.ROOT_TOKEN,
    run: runWsrepRecover,
    log,
  }).local;
  const routing = createRoutingComposition({
    environment: {
      ...environment,
      ELERA_EVENT_VERSION_PATH:
        environment.ELERA_EVENT_VERSION_PATH ??
        `${environment.ELERA_CONFIG_STATE_DIR ?? "/var/lib/elera"}/routing-event-versions.json`,
    },
    config,
    identity,
    observationStore: domain.observationStore,
    managed: domain.managed,
    query: (...args) => getDb()?.query?.(...args),
    resolveAddress: (host) => dns.lookup(host),
    log,
    getDrained,
  });
  const routingStream = createRoutingStream({
    token: environment.ROOT_TOKEN,
    nodeIdentity: identity,
    authorize: async (supplied, application) => {
      if (!supplied) return false;
      if (environment.ROOT_TOKEN && supplied === environment.ROOT_TOKEN) return true;
      const auth = await domain.managed?.authenticate?.(supplied);
      if (!auth || (application && auth.application && auth.application !== application))
        return false;
      return auth;
    },
    getEvent: routing.routingEvent,
    bus: routing.routingBus,
    telemetry,
    log,
    loadBalancerEndpoint: environment.ELERA_LOAD_BALANCER_ENDPOINT,
  });
  const traffic = createSupervisorTraffic({
    telemetry,
    identity,
    config,
    health,
    routingBus: routing.routingBus,
    log,
    getDb,
    setDrained,
  });
  return {
    health,
    domain,
    coldEvidence,
    routing,
    routingStream,
    traffic,
    telemetry,
  };
}
