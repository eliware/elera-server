import { createSupervisorControl } from "./wiring.mjs";
import { createSupervisorCluster } from "../cluster-wiring.mjs";
import { createControlResetWiring } from "./reset-wiring.mjs";
import { createSupervisorControlOptions } from "./options.mjs";

export function createSupervisorControlComposition({
  db,
  metadata,
  managed,
  applications,
  reconciler,
  artifactStore,
  routingBundles,
  routingEvent,
  recovery,
  observationStore,
  health,
  clusterDrain,
  lifecycle,
  telemetry,
  config,
  identity,
  intentState,
  coldState,
  getColdRecoveryProtocol: liveColdRecoveryProtocol,
  processController,
  applyIntent,
  log,
  environment = process.env,
} = {}) {
  if (
    typeof db?.query !== "function" ||
    typeof health?.status !== "function" ||
    typeof clusterDrain?.set !== "function" ||
    !coldState?.clusterDrain ||
    !coldState?.drain ||
    !processController?.stop ||
    !processController?.start
  )
    throw new TypeError("control composition dependencies are required");
  if (!identity?.name || !identity.name.includes("."))
    throw new TypeError("shared control identity must be a valid hostname");
  if (
    !config?.dataDir ||
    !telemetry?.summary ||
    !telemetry?.details ||
    !intentState ||
    typeof applyIntent !== "function"
  )
    throw new TypeError("control composition state dependencies are required");
  const cluster = createSupervisorCluster({
    query: (...args) => db.query(...args),
    health,
    processController,
    clusterDrain,
    environment,
    config,
    identity,
  });
  const { nodeDataReset } = createControlResetWiring({
    identity,
    config,
    health,
    recovery,
    observationStore,
    processController,
    coldState,
    log,
  });
  return createSupervisorControl(
    createSupervisorControlOptions({
      db,
      metadata,
      managed,
      applications,
      reconciler,
      artifactStore,
      routingBundles,
      routingEvent,
      recovery,
      observationStore,
      cluster,
      nodeDataReset,
      config,
      health,
      telemetry,
      coldState,
      lifecycle,
      liveColdRecoveryProtocol,
      intentState,
      environment,
      identity,
      applyIntent,
      log,
    }),
  );
}
