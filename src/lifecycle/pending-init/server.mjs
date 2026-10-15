import { createServer } from "node:http";
import { initializePendingData } from "./initialize.mjs";
import { loadIntent } from "../../intent/model.mjs";
import { createPendingInitAuthenticator } from "./authentication.mjs";
import { handlePendingRecoveryRoute } from "./recovery-routes.mjs";
import { handlePendingInitHealthRoute } from "./health-routes.mjs";
import { handlePendingInitEvidenceRoute } from "./evidence-route.mjs";
import { handlePendingInitResetRoute } from "./pending-init-reset-route.mjs";
import { createPendingInitializationRoute } from "./pending-init-initialize-route.mjs";
import { handlePendingInitAuthRoute } from "./pending-init-auth-route.mjs";
import { handlePendingInitFallbackRoute } from "./pending-init-fallback-route.mjs";

export function createPendingInitServer({
  environment = process.env,
  identity,
  log = console,
  initialize = initializePendingData,
  onInitialized = () => {},
  onRecoveryBootstrap = () => {},
  onRecoveryComplete = () => {},
  onRecoveryJoin = () => {},
  nodeDataReset,
  coldEvidence,
  recoveryRequired = false,
  recoveryReason = "recovery evidence is unavailable",
  recoveryProtocol,
} = {}) {
  if (!identity?.name)
    throw new TypeError("runtime identity is required for pending initialization");
  const intent = loadIntent(environment, identity);
  const standaloneOperation = () => {
    if (intent.cluster.members.length < 2) return "standalone-init";
    const localMembers = intent.cluster.members.filter((member) => member.name === identity.name);
    if (localMembers.length !== 1)
      throw new Error(
        `runtime hostname ${identity.name} must match exactly one configured cluster member; configured members: ${intent.cluster.members.map((member) => member.name).join(", ")}`,
      );
    return localMembers[0].name === intent.cluster.members[0].name ? "bootstrap" : "join-pending";
  };
  const authorized = createPendingInitAuthenticator(environment);
  const handleInitialization = createPendingInitializationRoute({
    authorized,
    environment,
    initialize,
    log,
    onInitialized,
    recoveryReason,
    recoveryRequired,
    standaloneOperation,
  });
  const server = createServer(async (request, response) => {
    if (handlePendingInitHealthRoute(request, response)) return;
    if (await handlePendingInitEvidenceRoute(request, response, { authorized, coldEvidence }))
      return;
    if (
      await handlePendingRecoveryRoute({
        request,
        response,
        authorized,
        recoveryRequired,
        recoveryReason,
        recoveryProtocol,
        onRecoveryBootstrap,
        onRecoveryComplete,
        onRecoveryJoin,
        identity,
        members: intent.cluster.members,
        log,
      })
    )
      return;
    if (
      recoveryRequired &&
      handlePendingInitAuthRoute(request, response, { authorized, recoveryReason })
    )
      return;
    if (await handleInitialization(request, response)) return;
    if (await handlePendingInitResetRoute(request, response, { authorized, nodeDataReset })) return;
    handlePendingInitFallbackRoute(response, { recoveryRequired, recoveryReason });
  });
  return { server, initialize };
}
