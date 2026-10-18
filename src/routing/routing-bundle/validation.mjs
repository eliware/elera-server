import { validateBundle } from "@eliware/elera-lib";

export function createRoutingBundleValidator(lease) {
  return async function validate(request = {}) {
    let bundle;
    try {
      bundle = await lease(request);
    } catch (error) {
      return { valid: false, error: error.message };
    }
    const normalized = validateBundle(bundle);
    return {
      valid: true,
      application: normalized.application,
      database: normalized.database,
      bundleVersion: normalized.bundleVersion,
      writer: normalized.writer,
      routeCount: normalized.routes.balanced.length,
    };
  };
}
