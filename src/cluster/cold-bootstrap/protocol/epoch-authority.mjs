import { authorizeRecoveryEpoch } from "./authorization.mjs";
import { beginRecoveryBootstrap } from "./bootstrap.mjs";
import { completeRecoveryEpoch } from "./completion.mjs";

export function createRecoveryEpochAuthority(dependencies) {
  return {
    authorize: (input) => authorizeRecoveryEpoch(input, dependencies),
    beginBootstrap: (input) => beginRecoveryBootstrap(input, dependencies),
    complete: (input) => completeRecoveryEpoch(input, dependencies),
    status: async () => (await dependencies.read()) ?? { phase: "pending" },
  };
}
