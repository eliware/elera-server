import { createAssignmentStore } from "../assignment-store.mjs";
import { createBundleRouteSelection } from "./route/selection.mjs";
import { createRoutingBundleLease } from "../routing-bundle/lease.mjs";
import { createRoutingBundleRebalancer } from "../routing-bundle/rebalance.mjs";
import { createRoutingBundleValidator } from "../routing-bundle/validation.mjs";

export function createRoutingBundleService({
  managed,
  observationStore,
  identity,
  environment = process.env,
  now = Date.now,
  assignmentStore = createAssignmentStore({
    path:
      environment.ELERA_ASSIGNMENTS_PATH ??
      `${environment.ELERA_CONFIG_STATE_DIR ?? "/var/lib/elera"}/routing-assignments.json`,
  }),
  validateAddresses = false,
  resolveAddress,
  log = {},
} = {}) {
  if (!managed?.lease || !observationStore?.snapshot)
    throw new TypeError("managed metadata and observation store are required");
  if (!identity?.name) throw new TypeError("runtime identity is required for routing bundles");
  const selection = createBundleRouteSelection({
    observationStore,
    environment,
    now,
    assignmentStore,
    validateAddresses,
    resolveAddress,
    log,
  });
  const lease = createRoutingBundleLease({ managed, identity, environment, selection });
  return {
    lease,
    validate: createRoutingBundleValidator(lease),
    rebalance: createRoutingBundleRebalancer(lease, selection),
  };
}
