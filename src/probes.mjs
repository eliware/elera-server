import http from "node:http";

export function createProbeServer({
  getStatus,
  controlHandler,
  upgradeHandler,
  isDraining = () => false,
  isShuttingDown = () => false,
  log,
}) {
  let startupHandler;
  const server = http.createServer(async (request, response) => {
    if (startupHandler && (await startupHandler(request, response))) return;
    if (request.url?.startsWith("/api/v1/") && isShuttingDown()) {
      response
        .writeHead(503, { "content-type": "application/json" })
        .end('{"ok":false,"error":"supervisor is shutting down"}\n');
      return;
    }
    if (request.url?.startsWith("/api/v1/")) {
      await controlHandler(request, response);
      return;
    }
    if (request.url === "/healthz") {
      response.writeHead(200, { "content-type": "text/plain" }).end("ok\n");
      return;
    }
    if (request.url === "/router-readyz") {
      try {
        const result = await getStatus();
        response
          .writeHead(result.ready ? 200 : 503, {
            "content-type": "text/plain",
            "x-elera-recovery-state": result.recovery?.state ?? "unknown",
          })
          .end(result.ready ? "ok\n" : "not available\n");
      } catch {
        response.writeHead(503).end("not available\n");
      }
      return;
    }
    if (request.url !== "/readyz") {
      response.writeHead(404).end();
      return;
    }
    try {
      const result = await getStatus();
      const ready = result.ready && !isDraining();
      response
        .writeHead(ready ? 200 : 503, {
          "content-type": "text/plain",
          "x-elera-recovery-state": result.recovery?.state ?? "unknown",
        })
        .end(ready ? "ok\n" : "not available\n");
    } catch (error) {
      log.warn("HTTP readiness check failed", { error });
      response.writeHead(503).end("not available\n");
    }
  });
  server.on("upgrade", async (request, socket, head) => {
    if (!(await upgradeHandler?.(request, socket, head))) socket.destroy();
  });
  server.setStartupHandler = (handler) => {
    startupHandler = handler;
  };
  server.start = (port, host, callback) => {
    if (server.listening) {
      callback?.();
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const onError = (error) => {
        server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        server.off("error", onError);
        callback?.();
        resolve();
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(port, host);
    });
  };
  return server;
}
