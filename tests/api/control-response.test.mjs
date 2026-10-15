import { expect, jest, test } from "@jest/globals";
import { createControlResponse } from "../../src/api/control-response.mjs";

test("adds the API version and request identity to responses", () => {
  const target = {
    writeHead: jest.fn(function () {
      return this;
    }),
    end: jest.fn(),
  };
  const request = { headers: { "x-request-id": "request-1" } };
  const response = createControlResponse(target, request);
  response.json(200, { ok: true });
  expect(target.writeHead).toHaveBeenCalledWith(
    200,
    expect.objectContaining({ "content-type": "application/json" }),
  );
  expect(target.end).toHaveBeenCalledWith(expect.stringContaining('"requestId":"request-1"'));
});

test("creates a request identity when the caller has none", () => {
  const target = {
    writeHead: jest.fn(function () {
      return this;
    }),
    end: jest.fn(),
  };
  const response = createControlResponse(target, { headers: {} }, () => "id");
  response.json(200, { ok: true });
  expect(target.end).toHaveBeenCalledWith(expect.stringContaining('"requestId":"req-id"'));
});
