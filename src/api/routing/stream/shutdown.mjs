export async function broadcastRoutingShutdown({
  sockets,
  event = {},
  code = 1012,
  reason = "supervisor restarting",
  nodeIdentity,
  loadBalancerEndpoint,
  version = 0,
}) {
  const timestamp = Date.now();
  const payload = JSON.stringify({
    type: "routing.shutdown",
    version: version + 1,
    generatedAt: new Date(timestamp).toISOString(),
    reconnect: true,
    ...(nodeIdentity ? { node: nodeIdentity.name, nodeIdentity } : {}),
    ...(loadBalancerEndpoint ? { loadBalancerEndpoint } : {}),
    reason,
    ...event,
  });
  await Promise.all(
    [...sockets].map(
      (socket) =>
        new Promise((resolve) => {
          if (socket.readyState !== 1) {
            resolve();
            return;
          }
          try {
            socket.send(payload, () => {
              socket.close(code, reason);
              resolve();
            });
          } catch {
            socket.close(code, reason);
            resolve();
          }
        }),
    ),
  );
  return version + 1;
}
