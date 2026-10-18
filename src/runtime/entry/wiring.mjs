import { createSupervisorProbes } from "../probe-wiring.mjs";
import { createSupervisorControlComposition } from "../control/composition.mjs";
import { isShuttingDown } from "../lifecycle/predicates.mjs";
import { createDeferredRecoveryProtocol } from "../deferred-recovery-protocol.mjs";

export function createSupervisorEntryWiring({
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
}) {
  const { health, domain, routing, routingStream, traffic } = services;
  const coldState = getColdState();
  const deferredRecoveryProtocol = createDeferredRecoveryProtocol(
    () => {
      const protocol = getColdState().coldRecoveryProtocol;
      return typeof protocol === "function" ? protocol() : protocol;
    },
    { timeoutMs: config.startupTimeoutMs ?? 5000 },
  );
  const control = createSupervisorControlComposition({
    db: { query: (...args) => getDb()?.query?.(...args) },
    ...domain,
    routingBundles: routing.routingBundles,
    routingEvent: routing.routingEvent,
    recovery,
    observationStore: domain.observationStore,
    health,
    clusterDrain: traffic.clusterDrain,
    lifecycle,
    telemetry: services.telemetry,
    config,
    identity,
    intentState: domain.intentState,
    coldState: { ...coldState, coldEvidence: coldState.coldEvidence ?? services.coldEvidence },
    getColdRecoveryProtocol: () => deferredRecoveryProtocol,
    processController: {
      start: (...args) => getMariaProcess()?.start?.(...args),
      stop: (...args) => getMariaProcess()?.stop?.(...args),
    },
    applyIntent,
    environment,
    log,
  });
  const probes = createSupervisorProbes({
    getStatus: () => health.status(),
    isDraining: () => traffic.drain.isDraining(),
    isShuttingDown: () => isShuttingDown(lifecycle.get()),
    controlHandler: (request, response) => control.handler(request, response),
    upgradeHandler: (request, socket, head) => routingStream.upgrade(request, socket, head),
    log,
  });
  return { control, probes, coldState };
}
