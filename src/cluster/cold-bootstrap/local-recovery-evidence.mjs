import { readStateFile } from "./state-file.mjs";
import { recoverState } from "./recovery.mjs";
import { inspectDataDirectory } from "../../lifecycle/data/directory.mjs";
import { isEvidenceFqdn } from "./evidence/fqdn.mjs";

export function createLocalRecoveryEvidence({ localNode, dataDir, health, read, run } = {}) {
  if (!isEvidenceFqdn(localNode?.name) || !dataDir || !health)
    throw new TypeError("cold bootstrap local data requires a FQDN identity");
  let generation = 0;
  let recoveryInFlight;
  let recoveredState;
  let recoveryFailure;
  const local = async () => {
    generation += 1;
    const directory = inspectDataDirectory(dataDir);
    const state = await readStateFile(dataDir, { read });
    const status = await health.status().catch(() => ({ ready: false, values: {} }));
    const active =
      status.ready === true &&
      status.values?.wsrep_local_state_comment === "Synced" &&
      status.values?.wsrep_cluster_status === "Primary" &&
      status.values?.wsrep_ready === "ON";
    let recovered;
    if (state.seqno < 0 && !active) {
      if (recoveryFailure) throw recoveryFailure;
      if (!recoveredState) {
        recoveryInFlight ??= recoverState(dataDir, { run })
          .then((value) => {
            recoveredState = value;
            return value;
          })
          .catch((error) => {
            recoveryFailure = error;
            throw error;
          })
          .finally(() => {
            recoveryInFlight = undefined;
          });
      }
      recovered = recoveredState ?? (await recoveryInFlight);
    }
    const latest = await health.status().catch(() => undefined);
    const currentlyActive =
      latest?.ready === true &&
      latest.values?.wsrep_local_state_comment === "Synced" &&
      latest.values?.wsrep_cluster_status === "Primary" &&
      latest.values?.wsrep_ready === "ON";
    if (currentlyActive)
      return {
        node: localNode.name,
        state: { ...state, savedSeqno: state.seqno, recoveredSeqno: undefined },
        dataDirectory: { valid: directory.action === "start", reason: directory.reason },
        active: true,
        galera: {
          clusterUuid: latest.values.wsrep_cluster_state_uuid,
          clusterStatus: latest.values.wsrep_cluster_status,
          localState: latest.values.wsrep_local_state_comment,
          ready: latest.values.wsrep_ready,
          clusterSize: Number(latest.values.wsrep_cluster_size),
        },
        generation,
        observedAt: new Date().toISOString(),
      };
    return {
      node: localNode.name,
      state: recovered
        ? { ...state, ...recovered, savedSeqno: state.seqno, recoveredSeqno: recovered.seqno }
        : { ...state, savedSeqno: state.seqno, recoveredSeqno: undefined },
      dataDirectory: { valid: directory.action === "start", reason: directory.reason },
      active,
      galera: {
        clusterUuid: status.values?.wsrep_cluster_state_uuid,
        clusterStatus: status.values?.wsrep_cluster_status,
        localState: status.values?.wsrep_local_state_comment,
        ready: status.values?.wsrep_ready,
        clusterSize: Number(status.values?.wsrep_cluster_size),
      },
      generation,
      observedAt: new Date().toISOString(),
    };
  };
  return local;
}
