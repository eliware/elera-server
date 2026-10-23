import { recoveryStartupDecision } from "./decision.mjs";
import { recordSupervisorRecoveryDecision } from "../decision.mjs";
import { authorizeSupervisorRecovery } from "../authorization.mjs";
import { resolveSupervisorRejoin } from "../../rejoin-decision.mjs";
import { resolveRecoveryPlan } from "../plan-retry.mjs";
import { inspectDataDirectory } from "../../../lifecycle/data/directory.mjs";

export async function resolveSupervisorStartupPlan({
  recoveryProtocol,
  startupTimeoutMs,
  identity,
  recoveryState,
  recoveryAudit,
  environment,
  members,
  config,
  intentState,
  log,
  startupServer,
  recoveryLease,
  unifiedListener,
} = {}) {
  const recoveryPlan = await resolveRecoveryPlan({
    recoveryProtocol,
    startupTimeoutMs,
    requiredMemberCount: members.length,
  });
  log.debug?.("Recovery phase: recovery plan resolved", {
    node: identity.name,
    mode: recoveryPlan.mode,
    winner: recoveryPlan.winner?.node,
  });
  let decision = recoveryStartupDecision(recoveryPlan, identity.name);
  await recordSupervisorRecoveryDecision({ decision, recoveryState, recoveryAudit, environment });
  const authorized = await authorizeSupervisorRecovery({
    decision,
    members,
    config,
    intentState,
    recoveryProtocol,
    recoveryLease,
    recoveryState,
    recoveryAudit,
    log,
  });
  decision = authorized.decision;
  decision = await resolveSupervisorRejoin({
    decision,
    members,
    config,
    environment,
    recoveryState,
  });
  if (decision.mode === "blocked" && inspectDataDirectory(config.dataDir).action === "start") {
    decision = {
      ...decision,
      mode: "rejoin",
      bootstrapComplete: true,
      reason: `usual Galera rejoin permitted: ${decision.reason}`,
    };
  }
  log.debug?.("Recovery phase: rejoin decision resolved", {
    node: identity.name,
    mode: decision.mode,
    localWinner: decision.localWinner,
  });
  if (!unifiedListener && !(decision.mode === "bootstrap" && decision.localWinner === true))
    await startupServer.close();
  return { decision, args: authorized.args };
}
