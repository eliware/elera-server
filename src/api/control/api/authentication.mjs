import { tokenMatches } from "../../authentication.mjs";

export async function authenticateControlRequest(request, { token, managed, metadata } = {}) {
  if (tokenMatches(request, token)) return { root: true, scopes: ["*"], sqlToken: token };
  const supplied = request.headers?.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!supplied) return null;
  const auth = (await (managed ?? metadata)?.authenticate?.(supplied)) ?? null;
  return auth ? { ...auth, sqlToken: supplied } : null;
}
