import { json } from "../http.mjs";

export function sendAccountResponse(response, status, body) {
  return response.json ? response.json(status, body) : json(response, status, body);
}
