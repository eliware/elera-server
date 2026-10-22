export async function routePendingInitRequest(request, response, handlers) {
  if (handlers.health(request, response)) return;
  if (await handlers.evidence(request, response)) return;
  if (await handlers.recovery(request, response)) return;
  if (handlers.recoveryAuth(request, response)) return;
  if (await handlers.initialization(request, response)) return;
  if (await handlers.reset(request, response)) return;
  handlers.fallback(response);
}
