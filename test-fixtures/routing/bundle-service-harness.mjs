import { createRoutingBundleService as createProductionRoutingBundleService } from "../../src/routing/bundle/service.mjs";

export function createRoutingBundleService(options = {}) {
  const values = new Map();
  const assignmentStore = options.assignmentStore ?? {
    get: async (application) => values.get(application),
    set: async (application, node) => {
      values.set(application, node);
      return node;
    },
    peek: (application) => values.get(application),
  };
  const managed = options.managed;
  const lease = managed?.lease;
  const managedWithExpiry = lease
    ? {
        ...managed,
        lease: async (request) => ({
          ...(await lease(request)),
          refreshAfter: "2098-12-31T00:00:00Z",
        }),
      }
    : managed;
  const observationStore = options.observationStore;
  const observations = observationStore?.snapshot
    ? {
        ...observationStore,
        snapshot: () =>
          (observationStore.snapshot() ?? []).map((item) => ({
            clusterId: "cluster",
            state: item.synced ? "Synced" : "Down",
            ...item,
          })),
      }
    : observationStore;
  return createProductionRoutingBundleService({
    identity: { name: "node.example.test" },
    ...options,
    managed: managedWithExpiry,
    observationStore: observations,
    assignmentStore,
  });
}
