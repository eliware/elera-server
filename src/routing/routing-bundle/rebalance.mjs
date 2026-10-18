export function createRoutingBundleRebalancer(lease, selection) {
  return async function rebalance(request = {}) {
    const key = request.application ?? "default";
    selection.invalidate(key);
    const bundle = await lease(request);
    return { bundle, recalculated: true };
  };
}
