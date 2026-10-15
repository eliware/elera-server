import { tokenMatches } from "./authentication.mjs";

export async function authenticateControlRequest(request, { token, managed, metadata } = {}) {
  if (tokenMatches(request, token)) return { root: true, scopes: ["*"] };
  const supplied = request.headers?.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!supplied) return null;
  return (managed ?? metadata)?.authenticate?.(supplied) ?? null;
}
