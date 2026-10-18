import { WebSocketServer } from "ws";
import { connectRoutingStreamClient } from "./stream/client.mjs";
import { broadcastRoutingShutdown } from "./stream/shutdown.mjs";

export function createRoutingStream({
  token,
  authorize,
  nodeIdentity,
  getEvent,
  bus,
  telemetry,
  log,
  loadBalancerEndpoint,
  websocketServer = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 }),
}) {
  const server = websocketServer;
  const sockets = new Set();
  let stopping = false;
  let eventVersion = 0;
  server.on("connection", (socket, request) => {
    if (stopping) {
      socket.close(1012, "supervisor restarting");
      return;
    }
    connectRoutingStreamClient({ socket, request, bus, getEvent, telemetry, log, sockets });
  });
  async function upgrade(request, socket, head) {
    if (stopping) {
      socket.write("HTTP/1.1 503 Process Unavailable\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return false;
    }
    const supplied = request.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    const url = new URL(request.url, "http://localhost");
    if (!url.pathname.startsWith("/api/v1/routing/stream")) return false;
    const permitted = authorize
      ? await authorize(supplied, url.searchParams.get("application"))
      : Boolean(token && supplied === token);
    if (!permitted) {
      socket.write("HTTP/1.1 401 Not approved\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return false;
    }
    request.eleraAuthorization = permitted;
    server.handleUpgrade(request, socket, head, (client) =>
      server.emit("connection", client, request),
    );
    return true;
  }
  async function shutdown(event = {}, { code = 1012, reason = "supervisor restarting" } = {}) {
    stopping = true;
    eventVersion = await broadcastRoutingShutdown({
      sockets,
      event,
      code,
      reason,
      nodeIdentity,
      loadBalancerEndpoint,
      version: eventVersion,
    });
  }
  return {
    upgrade,
    shutdown,
    close: () => {
      stopping = true;
      for (const socket of sockets) socket.close(1012, "supervisor restarting");
      return server.close();
    },
    isStopping: () => stopping,
  };
}
