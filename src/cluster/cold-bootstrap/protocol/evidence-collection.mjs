import { validateRecoveryEvidence } from "../evidence/validation.mjs";

export function createRecoveryEvidenceCollector({
  nodes,
  localEvidence,
  fetchEvidence,
  now,
  maxEvidenceAgeMs,
  log = {},
}) {
  const debug = typeof log.debug === "function" ? log.debug : () => {};
  const isActivePrimary = (item, evidence) => {
    const clusterUuid = item.galera?.clusterUuid;
    const localName = nodes.find((node) => node.local)?.name;
    const localItem = evidence.find((candidate) => candidate.node === localName);
    const localUuid = localItem?.galera?.clusterUuid ?? localItem?.uuid;
    return (
      item.active === true &&
      item.galera?.clusterStatus === "Primary" &&
      item.galera?.localState === "Synced" &&
      (item.galera?.ready === "ON" || item.galera?.ready === true) &&
      typeof clusterUuid === "string" &&
      (!localUuid || localUuid === clusterUuid)
    );
  };
  const collect = async () => {
    debug("Collecting recovery data", { nodes: nodes.map((node) => node.name) });
    const results = await Promise.allSettled(
      nodes.map(async (node) =>
        node.local ? localEvidence() : fetchEvidence(node.url ?? node, node.name),
      ),
    );
    const identityMismatch = results.find(
      (result, index) => result.status === "fulfilled" && result.value?.node !== nodes[index].name,
    );
    if (identityMismatch)
      throw Object.assign(
        new Error("recovery evidence identity does not match its configured member"),
        {
          code: "RECOVERY_EVIDENCE_IDENTITY_MISMATCH",
        },
      );
    const failed = results.find((result) => result.status === "rejected");
    if (failed && results.every((result) => result.status === "rejected")) throw failed.reason;
    const evidence = results
      .filter((result) => result.status === "fulfilled")
      .map(({ value: item }) => ({
        ...(item.state ?? item),
        node: item.node,
        dataDirectory: item.dataDirectory,
        galera: item.galera,
        active: item.active,
        generation: item.generation,
        observedAt: item.observedAt,
      }));
    const validated = validateRecoveryEvidence(evidence, {
      now: now(),
      maxAgeMs: maxEvidenceAgeMs,
    });
    const requiredMembers = Math.floor(nodes.length / 2) + 1;
    if (failed && validated.length < requiredMembers) throw failed.reason;
    const active = validated.find((item) => isActivePrimary(item, validated));
    if (
      active &&
      validated.length >= requiredMembers &&
      validated.filter((item) => item.uuid === active.galera.clusterUuid).length >= requiredMembers
    ) {
      debug("Active Primary detected. Recovery will join it", { evidence });
      return { evidence: validated, activePrimary: true };
    }
    debug("Recovery data validated", { evidence: validated, partial: Boolean(failed) });
    return {
      evidence: validated,
      failures: results
        .filter((result) => result.status === "rejected")
        .map((result) => result.reason),
      activePrimary: false,
      partial: Boolean(failed),
    };
  };
  return { collect, isActivePrimary };
}
