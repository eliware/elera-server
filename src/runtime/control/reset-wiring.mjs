import { createNodeDataReset } from "../../lifecycle/node/data-reset.mjs";

export function createControlResetWiring({
  identity,
  config,
  health,
  recovery,
  observationStore,
  processController,
  coldState,
  log,
}) {
  let fenced = false;
  let routingExcluded = false;
  const fence = async () => {
    coldState.clusterDrain.set(true);
    fenced = true;
  };
  const excludeRouting = async () => {
    coldState.clusterDrain.set(true);
    routingExcluded = true;
  };
  const isFenced = async () => fenced && coldState.drain.isDraining();
  const isRoutingExcluded = async () => routingExcluded && coldState.drain.isDraining();
  const nodeDataReset = createNodeDataReset({
    node: identity.name,
    dataDir: config.dataDir,
    getStatus: () => health.status(),
    getRecoveryState: () => recovery.status(),
    getDonors: async () =>
      observationStore.all().map((observation) => ({
        ...observation,
        node: observation.node ?? observation.nodeId,
        healthy:
          observation.healthy ?? (observation.health === "ok" || observation.health === "ready"),
        primary: observation.primary === true || observation.primary === "Primary",
      })),
    fence,
    isFenced,
    excludeRouting,
    isRoutingExcluded,
    stop: () => processController.stop(config.shutdownTimeoutMs),
    restart: processController.start,
    audit: log,
  });
  return { nodeDataReset };
}
