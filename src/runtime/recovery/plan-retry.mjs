export async function resolveRecoveryPlan({
  recoveryProtocol,
  startupTimeoutMs = 15000,
  requiredMemberCount,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  let plan;
  const attempts = Math.max(1, Math.min(60, Math.ceil(startupTimeoutMs / 1000)));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    plan = await recoveryProtocol.plan();
    const incompleteBootstrap =
      plan.mode === "bootstrap" &&
      Number.isInteger(requiredMemberCount) &&
      Array.isArray(plan.evidence) &&
      plan.evidence.length < requiredMemberCount;
    if ((plan.mode !== "blocked" && !incompleteBootstrap) || attempt + 1 >= attempts) {
      if (incompleteBootstrap)
        return {
          mode: "blocked",
          eligible: false,
          reason: "recovery data does not contain every configured member",
          code: "INCOMPLETE_RECOVERY_EVIDENCE",
          evidence: plan.evidence,
        };
      break;
    }
    if (
      ["SPLIT_BRAIN", "RECOVERY_EVIDENCE_CONFLICT"].includes(plan.code) ||
      /UUIDs do not match|multiple nodes are marked safe_to_bootstrap|split.?brain/i.test(
        plan.reason ?? "",
      )
    )
      break;
    await sleep(1000);
    await recoveryProtocol.retry();
  }
  return plan;
}
