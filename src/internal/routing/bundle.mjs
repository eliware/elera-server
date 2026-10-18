import { createSupervisorBundle as createBundle } from "./bundle/create.mjs";
import { validateSupervisorBundle as validateBundle } from "./bundle/validation.mjs";

export function createSupervisorBundle(options) {
  return createBundle(options);
}

export function validateSupervisorBundle(bundle) {
  return validateBundle(bundle);
}
