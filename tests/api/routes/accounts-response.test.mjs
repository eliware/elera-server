import { expect, jest, test } from "@jest/globals";
import { handleAccountRoute } from "../../../src/api/routes/accounts.mjs";
import { sendAccountResponse } from "../../../src/api/routes/accounts-response.mjs";

const request = (body) => ({
  async *[Symbol.asyncIterator]() {
    if (body) yield JSON.stringify(body);
  },
});

test("uses the shared JSON response writer when no response helper is provided", async () => {
  const target = {
    writeHead: jest.fn(function () {
      return this;
    }),
    setHeader: jest.fn(),
    end: jest.fn(),
  };
  await expect(
    handleAccountRoute({
      method: "GET",
      path: "/api/v1/accounts",
      request: request(),
      response: target,
      db: { query: async () => [[]] },
    }),
  ).resolves.toBe(true);
  expect(target.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
});

test("uses a response helper and defaults null account collections", async () => {
  const target = { json: jest.fn() };
  await expect(
    handleAccountRoute({
      method: "GET",
      path: "/api/v1/accounts",
      request: request(),
      response: target,
      db: { query: async () => [[]] },
    }),
  ).resolves.toBe(true);
  await expect(
    handleAccountRoute({
      method: "POST",
      path: "/api/v1/accounts/import",
      request: request({ confirm: true, accounts: [{ user: "app", host: null, grants: null }] }),
      response: target,
      db: { query: async () => [[]] },
    }),
  ).resolves.toBe(true);
  await expect(
    handleAccountRoute({
      method: "POST",
      path: "/api/v1/accounts/import",
      request: request({ confirm: true, accounts: null }),
      response: target,
      db: { query: async () => [[]] },
    }),
  ).resolves.toBe(true);
});

test("writes account responses through the shared response helper", () => {
  const target = { json: jest.fn() };
  sendAccountResponse(target, 200, { ok: true });
  expect(target.json).toHaveBeenCalledWith(200, { ok: true });
});
