import { calculateRoutes } from "../../decision.mjs";
import { createQuorumAssignmentCoordinator } from "../../quorum-assignment.mjs";
import { resolveEligibleBundleObservations } from "./eligibility.mjs";

export function createBundleRouteSelection({
  observationStore,
  environment,
  now,
  assignmentStore,
  validateAddresses,
  resolveAddress,
  log,
}) {
  const cache = new Map();
  const assignments = createQuorumAssignmentCoordinator({
    assignmentStore,
    observationStore,
    environment,
    now,
    log,
  });
  return {
    async resolve(application) {
      const current = now();
      const cached = cache.get(application);
      const observations = observationStore.snapshot();
      const { observations: reachable } = await resolveEligibleBundleObservations(observations, {
        now: current,
        environment,
        validateAddresses,
        resolveAddress,
        log,
      });
      const assignedWriter = await assignments.read(application);
      const routes =
        cached && current - cached.calculatedAt < 1000
          ? cached.routes
          : calculateRoutes({
              application,
              observations: reachable,
              previousWriterHost: assignedWriter ?? cached?.routes.primary?.[0]?.host,
              now: current,
            });
      if (routes.writer?.host && routes.writer.host !== assignedWriter)
        await assignments.write(application, routes.writer.host, observations);
      if (!cached || routes !== cached.routes)
        cache.set(application, { calculatedAt: current, routes });
      return routes;
    },
    invalidate: (application) => cache.delete(application),
  };
}
