export function handlePendingInitHealthRoute(request, response) {
  if (request.url === "/healthz") {
    response.writeHead(200, { "content-type": "text/plain" }).end("ok\n");
    return true;
  }
  if (request.url === "/readyz") {
    response.writeHead(503, { "content-type": "text/plain" }).end("not ready\n");
    return true;
  }
  return false;
}
