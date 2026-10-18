import { isInitializedLifecycleState, isLifecycleAction, isLifecycleFqdn } from "./plan-rules.mjs";

export function planLifecycle(
  action,
  { enabled, ready, state, synced = false, quorum = false, nodeId = null, target = null } = {},
) {
  if (!isLifecycleAction(action)) throw new TypeError("unsupported lifecycle action");
  if (!enabled)
    return { action, eligible: false, changed: false, reason: "Elera mode is disabled" };
  if (!isLifecycleFqdn(nodeId))
    return {
      action,
      eligible: false,
      changed: false,
      reason: "valid local node identity is required",
    };
  if (action === "bootstrap") {
    const initialized = isInitializedLifecycleState(state);
    return {
      action,
      eligible: !ready && !quorum && !initialized,
      changed: false,
      reason: ready
        ? "node is already ready"
        : quorum
          ? "quorum previously exists"
          : initialized
            ? "initialized data is not eligible for bootstrap"
            : "eligible for bootstrap",
    };
  }
  if (!isLifecycleFqdn(target))
    return {
      action,
      eligible: false,
      changed: false,
      reason: "valid target identity is required",
      nodeId,
    };
  if (target === nodeId)
    return {
      action,
      eligible: false,
      changed: false,
      reason: "lifecycle target must not be the local node",
      nodeId,
      target,
    };
  if (action === "join")
    return {
      action,
      eligible: !ready && state !== "Initialized" && quorum,
      changed: false,
      reason: ready
        ? "node is already ready"
        : state === "Initialized"
          ? "initialized node must complete startup recovery before joining"
          : quorum
            ? "eligible to join Primary component"
            : "joining requires an established quorum",
      nodeId,
      target,
    };
  if (action === "leave")
    return {
      action,
      eligible: ready && synced && quorum,
      changed: false,
      reason: !ready
        ? "node is not ready"
        : !synced
          ? "node is not synced"
          : !quorum
            ? "keep requires quorum"
            : "eligible for graceful keep",
      nodeId,
      target,
    };
  return {
    action,
    eligible: !ready && quorum,
    changed: false,
    reason: ready
      ? "recovery is only for an offline node"
      : quorum
        ? "eligible for recovery"
        : "recovery requires an established quorum",
    nodeId,
    target,
  };
}
