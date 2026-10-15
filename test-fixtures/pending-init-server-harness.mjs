import { once } from "node:events";

export async function withPendingInitServer(server, run) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;
  try {
    await run(base);
  } finally {
    server.close();
    await once(server, "close");
  }
}

export function pendingClusterEnvironment(members) {
  return {
    ROOT_TOKEN: "root",
    SUPERVISOR_INTENT_JSON: JSON.stringify({
      apiVersion: "elera.eliware.dev/v1alpha1",
      kind: "SupervisorIntent",
      cluster: { name: "test", members },
      mariadb: { port: 3306 },
      routing: { healthIntervalMs: 1000 },
      drain: { queryTimeoutMs: 1 },
    }),
  };
}

export function rootHeaders(json = false) {
  return {
    authorization: "Bearer root",
    ...(json ? { "content-type": "application/json" } : {}),
  };
}
