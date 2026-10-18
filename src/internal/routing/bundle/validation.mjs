import { validateBundle } from "@eliware/elera-lib";

function invalid(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

export function validateSupervisorBundle(bundle) {
  try {
    return validateBundle(bundle);
  } catch (error) {
    throw invalid(error.message);
  }
}
