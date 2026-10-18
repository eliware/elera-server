import { createHash } from "node:crypto";

export function createRecoveryEpoch({
  clusterId,
  evidence,
  winner,
  quorum,
  now = new Date(),
} = {}) {
  if (
    !clusterId ||
    !winner?.node ||
    !Number.isInteger(winner.seqno) ||
    !Array.isArray(evidence) ||
    !Array.isArray(quorum) ||
    quorum.length === 0
  )
    throw new TypeError("complete recovery epoch data is required");
  const canonicalEvidence = evidence
    .toSorted((a, b) => String(a.node).localeCompare(String(b.node)))
    .map(({ node, uuid, seqno, savedSeqno, recoveredSeqno, dataDirectory, galera, active }) => ({
      node,
      uuid,
      seqno,
      savedSeqno,
      recoveredSeqno,
      dataDirectory,
      galera,
      active: Boolean(active),
    }));
  const digest = createHash("sha256").update(JSON.stringify(canonicalEvidence)).digest("hex");
  return {
    version: 1,
    epoch: `${clusterId}:${digest}`,
    clusterId,
    evidenceDigest: digest,
    winner: { node: winner.node, uuid: winner.uuid, seqno: winner.seqno },
    quorum: [...new Set(quorum)].sort(),
    phase: "evidence",
    createdAt: new Date(now).toISOString(),
  };
}
