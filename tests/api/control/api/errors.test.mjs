import { expect, test, jest } from "@jest/globals";
import { respondToControlApiError } from "../../../../src/api/control/api/errors.mjs";

function response() {
  return {
    status: 0,
    body: "",
    writeHead(status) {
      this.status = status;
      return this;
    },
    end(body) {
      this.body = body;
      return this;
    },
  };
}

test("logs and returns the error status and message", () => {
  const target = response();
  const log = { error: jest.fn() };
  const error = Object.assign(new Error("bad request"), { statusCode: 422 });
  const request = { method: "POST", url: "/api/v1/items" };
  respondToControlApiError(error, target, request, log);
  expect(target.status).toBe(422);
  expect(JSON.parse(target.body)).toMatchObject({
    apiVersion: "v1",
    requestId: expect.any(String),
    ok: false,
    error: "bad request",
  });
  expect(log.error).toHaveBeenCalledWith("Control API request failed", {
    error,
    method: "POST",
    url: "/api/v1/items",
  });
});

test("uses fallback status and message values", () => {
  const target = response();
  respondToControlApiError({}, target, { method: "GET", url: "/api/v1/status" });
  expect(target.status).toBe(500);
  expect(JSON.parse(target.body)).toMatchObject({
    apiVersion: "v1",
    requestId: expect.any(String),
    ok: false,
    error: "[object Object]",
  });
});
