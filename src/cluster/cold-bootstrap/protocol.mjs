import { createRecoveryEvidenceCollector } from "./protocol/evidence-collection.mjs";
import { createRecoveryPlanner } from "./protocol/recovery-plan.mjs";
import { createRecoveryEpochAuthority } from "./protocol/epoch-authority.mjs";
import { verifyRecoveryMembership } from "./protocol/verify-membership.mjs";

export function createColdRecoveryProtocol({
  nodes,
  localEvidence,
  fetchEvidence,
  store,
  publishEvent = async () => {},
  now = () => new Date(),
  maxEvidenceAgeMs = 10000,
  log = {},
} = {}) {
  if (
    !Array.isArray(nodes) ||
    nodes.length === 0 ||
    typeof localEvidence !== "function" ||
    typeof fetchEvidence !== "function" ||
    !store
  )
    throw new TypeError("cold recovery protocol dependencies are required");
  let current;
  const debug = typeof log.debug === "function" ? log.debug : () => {};
  const read = async () => (current ??= await store.read());
  const persist = (value, expectedEpoch) =>
    store.write(value, expectedEpoch === undefined ? undefined : { expectedEpoch });
  const { collect, isActivePrimary } = createRecoveryEvidenceCollector({
    nodes,
    localEvidence,
    fetchEvidence,
    now,
    maxEvidenceAgeMs,
    log,
  });
  const planner = createRecoveryPlanner({
    nodes,
    collect,
    isActivePrimary,
    now,
    persist,
    publishEvent,
    debug,
    setCurrent: (value) => (current = value),
  });
  const authority = createRecoveryEpochAuthority({
    read,
    persist,
    collect,
    verifyMembership: (epoch) =>
      verifyRecoveryMembership({ collect, nodes, clusterId: epoch.clusterId }),
    now,
    publishEvent,
    debug,
    setCurrent: (value) => (current = value),
  });
  return {
    async evidence() {
      return (await collect()).evidence;
    },
    plan: planner.plan,
    async retry() {
      if (current?.code === "RECOVERY_EVIDENCE_IDENTITY_MISMATCH") return current;
      current = undefined;
      return this.plan();
    },
    ...authority,
  };
}
