import { createSupervisorBundle as connectionBundleFromConfig } from "../../internal/routing/bundle.mjs";
import { resolveRoutingBundleIdentity } from "./identity.mjs";
import { validateBundleRoutes } from "../bundle/route/validation.mjs";
import { toBundleVersion } from "../bundle/version.mjs";

export function createRoutingBundleLease({ managed, identity, environment, selection }) {
  return async function lease(request) {
    const result = await managed.lease(request);
    const leaseIdentity = resolveRoutingBundleIdentity(request, result, identity);
    const { application, database, credentialIdentity, key } = leaseIdentity;
    const routes = await selection.resolve(key);
    const selected = routes.balanced.length ? routes : result.routes;
    validateBundleRoutes(selected);
    return connectionBundleFromConfig({
      ...result,
      application,
      database,
      identity: credentialIdentity,
      routes: { primary: selected.primary, balanced: selected.balanced },
      writer: selected.writer,
      failover: selected.failover,
      readers: selected.readers,
      bundleVersion: toBundleVersion(
        routes.balanced.length ? routes.bundleVersion : result.bundleVersion,
      ),
      nodeIdentity: { name: identity.name, address: identity.name },
      ports: {
        sql: Number(environment.ELERA_NODE_SQL_PORT ?? 3306),
        http: Number(environment.ELERA_HTTP_PORT ?? 8080),
      },
    });
  };
}
