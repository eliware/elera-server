import { generate as generateSnowflake } from "@eliware/snowflake";
import { json } from "./http.mjs";

export function createControlResponse(target, request, createRequestId = generateSnowflake) {
  return {
    json: (status, body) =>
      json(target, status, {
        apiVersion: "v1",
        requestId: request.headers?.["x-request-id"] ?? `req-${createRequestId()}`,
        ...body,
      }),
  };
}
