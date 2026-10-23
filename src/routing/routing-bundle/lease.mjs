import { createSupervisorBundle as connectionBundleFromConfig } from "../../internal/routing/bundle.mjs";
import { resolveRoutingBundleIdentity } from "./identity.mjs";
import { validateBundleRoutes } from "../bundle/route/validation.mjs";
import { toBundleVersion } from "../bundle/version.mjs";

export function createRoutingBundleLease({ managed, identity, environment, selection }) {
  return async function lease(request) {
    const tokenRequest = request.root === true || request.tokenId !== undefined;
    const result = tokenRequest
      ? await managed.sqlConnection(request).then((credentials) => ({
          ...credentials,
          application: request.application ?? "default",
          database: request.database ?? "elera_meta",
          physicalDatabase: request.physicalDatabase ?? "elera_meta",
          identity: request.identity ?? (request.root ? "root" : (request.name ?? "token")),
          nodeIdentity: identity.name,
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        }))
      : await managed.lease(request);
    const leaseIdentity = tokenRequest
      ? {
          application: result.application,
          database: result.database,
          credentialIdentity: result.identity,
          key: result.application,
        }
      : resolveRoutingBundleIdentity(request, result, identity);
    const { application, database, credentialIdentity, key } = leaseIdentity;
    const routes = await selection.resolve(key);
    let selected = routes.balanced.length ? routes : result.routes;
    if (!selected && Number(environment.ELERA_CLUSTER_SIZE ?? 0) === 1) {
      const local = {
        host: identity.name,
        port: Number(environment.ELERA_NODE_SQL_PORT ?? 3306),
        nodeId: identity.name,
      };
      selected = {
        primary: [local],
        balanced: [local],
        writer: local,
        failover: [],
        readers: [local],
        bundleVersion: "standalone",
      };
    }
    if (!selected)
      throw Object.assign(new Error("no eligible SQL route is available"), { statusCode: 503 });
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
