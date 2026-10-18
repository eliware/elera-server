const isFqdn = (value) =>
  typeof value === "string" &&
  value.length <= 253 &&
  value.includes(".") &&
  /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(value);

export function validateBundleRoutes(routes) {
  for (const kind of ["primary", "balanced"])
    for (const route of routes[kind] ?? []) {
      if (!isFqdn(route.host) || !isFqdn(route.nodeId ?? route.host))
        throw Object.assign(new Error(`routing ${kind} contains a non-FQDN node identity`), {
          statusCode: 503,
        });
    }
  return routes;
}
