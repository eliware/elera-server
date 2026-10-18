export function connectRoutingStreamClient({
  socket,
  request,
  bus,
  getEvent,
  telemetry,
  log,
  sockets,
}) {
  sockets.add(socket);
  const application =
    request.eleraAuthorization?.application ??
    new URL(request.url, "http://localhost").searchParams.get("application") ??
    "default";
  const client = {
    send: (event) => socket.readyState === 1 && socket.send(JSON.stringify(event)),
    ping: () => socket.ping(),
  };
  const unsubscribe = bus.subscribe(
    client,
    (event) => !event.application || event.application === application,
  );
  const initial = getEvent(application);
  if (initial) client.send(initial);
  socket.on("close", () => {
    sockets.delete(socket);
    unsubscribe();
  });
  socket.on("message", (data) => {
    try {
      telemetry?.accept(JSON.parse(data.toString()));
    } catch (error) {
      log?.warn?.("Invalid routing telemetry message", { error });
    }
  });
  socket.on("error", (error) => log?.warn?.("Routing stream socket failed", { error }));
}
