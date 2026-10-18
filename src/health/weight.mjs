export function calculateWeight(values) {
  if (
    values.wsrep_local_state_comment !== "Synced" ||
    values.wsrep_ready !== "ON" ||
    values.wsrep_cluster_status !== "Primary"
  )
    return 0;
  const recv = Number(values.wsrep_local_recv_queue);
  const send = Number(values.wsrep_local_send_queue);
  const paused = Number(values.wsrep_flow_control_paused);
  if (![recv, send, paused].every(Number.isFinite) || recv > 16 || send > 16 || paused >= 0.05)
    return 0;
  return Math.max(
    1,
    100 -
      Math.min(40, Math.floor((Math.max(recv, send) * 40) / 16)) -
      Math.min(20, Math.floor(paused * 400)),
  );
}
