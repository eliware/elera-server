import { retryStartupEvidence } from "./evidence/retry.mjs";
import { resolveStartupRecoveryOutcome } from "./recovery-outcome.mjs";

export function createStartupRecoveryDecision({
  nodes,
  expectedNodeCount = nodes?.length,
  localEvidence,
  fetchEvidence,
  attempts = 15,
  delayMs = 1000,
  epoch,
} = {}) {
  const names = nodes?.map((node) => node?.name);
  if (
    !Array.isArray(nodes) ||
    nodes.length === 0 ||
    !Number.isInteger(expectedNodeCount) ||
    nodes.length !== expectedNodeCount ||
    names.some((name) => !name || !name.includes(".")) ||
    new Set(names).size !== names.length ||
    typeof localEvidence !== "function" ||
    typeof fetchEvidence !== "function" ||
    !Number.isInteger(attempts) ||
    attempts < 1 ||
    !Number.isFinite(delayMs) ||
    delayMs < 0
  )
    throw new TypeError(
      "startup recovery decision dependencies require a complete FQDN node inventory",
    );
  return () =>
    retryStartupEvidence({
      attempts,
      delayMs,
      collect: () =>
        Promise.allSettled(
          nodes.map(async (node) => (node.local ? localEvidence() : fetchEvidence(node))),
        ),
      resolve: (results) => resolveStartupRecoveryOutcome({ nodes, results, epoch }),
    });
}
