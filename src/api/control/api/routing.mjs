import { handleAccountRoute } from "../../routes/accounts.mjs";
import { handleApplicationRoute } from "../../routes/applications.mjs";
import { handleArtifactRoute } from "../../routes/artifacts.mjs";
import { handleClusterRoute } from "../../routes/cluster.mjs";
import { handleColdRecoveryRoute } from "../../routes/cold/recovery.mjs";
import { handleInitializationRoute } from "../../routes/initialization.mjs";
import { handleIntentRoute } from "../../routes/intent.mjs";
import { handleManagedRoute } from "../../routes/managed.mjs";
import { handleMetadataRoute } from "../../routes/metadata.mjs";
import { handleNodeDataResetRoute } from "../../routes/node-data-reset.mjs";
import { handleObservationRoute } from "../../routes/observations.mjs";
import { handleReconcileRoute } from "../../routes/reconcile.mjs";
import { handleRecoveryRoute } from "../../routes/recovery.mjs";
import { handleRoutingAdminRoute } from "../../routes/routing/admin.mjs";
import { handleRoutingResyncRoute } from "../../routes/routing/resync.mjs";
import { handleRoutingRoute } from "../../routes/routing.mjs";
import { handleStatusRoute } from "../../routes/status.mjs";
import { handleTelemetryRoute } from "../../routes/telemetry.mjs";
import { handleTrafficRoute } from "../../routes/traffic.mjs";

export async function dispatchControlRoute(
  context,
  { applications, nodeDataReset, reconciler, artifactStore, routingBundles } = {},
  handlers = {},
) {
  const route = (name, fallback) => handlers[name] ?? fallback;
  return (
    (await route("status", handleStatusRoute)(context)) ||
    (await route("telemetry", handleTelemetryRoute)(context)) ||
    (await route("intent", handleIntentRoute)(context)) ||
    (await route("account", handleAccountRoute)(context)) ||
    (await route("recovery", handleRecoveryRoute)(context)) ||
    (await route("coldRecovery", handleColdRecoveryRoute)(context)) ||
    (await route("cluster", handleClusterRoute)(context)) ||
    (await route("traffic", handleTrafficRoute)(context)) ||
    (await route("initialization", handleInitializationRoute)(context)) ||
    (context.metadata && (await route("metadata", handleMetadataRoute)(context))) ||
    (await route("application", handleApplicationRoute)({ ...context, applications })) ||
    (await route("nodeDataReset", handleNodeDataResetRoute)({ ...context, nodeDataReset })) ||
    (await route("observation", handleObservationRoute)(context)) ||
    (await route("managed", handleManagedRoute)(context)) ||
    (await route("reconcile", handleReconcileRoute)({ ...context, reconciler })) ||
    (await route("artifact", handleArtifactRoute)({ ...context, artifactStore })) ||
    (await route("routingAdmin", handleRoutingAdminRoute)({ ...context, routingBundles })) ||
    (await route("routing", handleRoutingRoute)({ ...context, routingBundles })) ||
    route("routingResync", handleRoutingResyncRoute)({ ...context, getEvent: context.routingEvent })
  );
}
