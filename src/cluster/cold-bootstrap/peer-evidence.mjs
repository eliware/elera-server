import { createLocalRecoveryEvidence } from "./local-recovery-evidence.mjs";
import { createRemoteRecoveryEvidence } from "./remote-recovery-evidence.mjs";

export function createColdBootstrapEvidence(options = {}) {
  const local = createLocalRecoveryEvidence(options);
  const remote = createRemoteRecoveryEvidence(options);
  return { local, remote };
}
