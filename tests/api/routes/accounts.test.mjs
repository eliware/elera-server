import { expect, jest, test } from "@jest/globals";
import { handleAccountRoute } from "../../../src/api/routes/accounts.mjs";

const response = () => ({
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
});
const request = (body) => ({
  async *[Symbol.asyncIterator]() {
    if (body) yield JSON.stringify(body);
  },
});
test("account route handles listing, export, import and unknown paths", async () => {
  const db = {
    query: async (sql) =>
      sql.includes("SHOW GRANTS") ? [[{ grant: "GRANT USAGE" }]] : [[{ User: "app", Host: "%" }]],
  };
  const list = response();
  expect(
    await handleAccountRoute({
      method: "GET",
      path: "/api/v1/accounts",
      request: request(),
      response: list,
      db,
      auth: { root: true },
    }),
  ).toBe(true);
  const exported = response();
  expect(
    await handleAccountRoute({
      method: "POST",
      path: "/api/v1/accounts/export",
      request: request(),
      response: exported,
      db,
      auth: { root: true },
    }),
  ).toBe(true);
  const imported = response();
  expect(
    await handleAccountRoute({
      method: "POST",
      path: "/api/v1/accounts/import",
      request: request({ confirm: true, accounts: [{ user: "app", grants: [] }] }),
      response: imported,
      db,
      auth: { root: true },
    }),
  ).toBe(true);
  expect(
    await handleAccountRoute({
      method: "GET",
      path: "/missing",
      request: request(),
      response: response(),
      db,
      auth: { root: true },
    }),
  ).toBe(false);
});

test("delegates managed account provision, revoke, and verification outcomes", async () => {
  const db = { query: async (sql) => (sql.startsWith("SHOW GRANTS") ? [[], []] : [[]]) };
  const context = (path, body) => ({
    method: "POST",
    path,
    request: request(body),
    response: response(),
    db,
    auth: { root: true },
  });
  await expect(
    handleAccountRoute(context("/api/v1/accounts/provision", { user: "app", database: "db" })),
  ).resolves.toBe(true);
  await expect(
    handleAccountRoute(context("/api/v1/accounts/revoke", { user: "app" })),
  ).resolves.toBe(true);
  await expect(
    handleAccountRoute(context("/api/v1/accounts/verify", { user: "app" })),
  ).resolves.toBe(true);
});
test("returns unavailable when account verification finds no grants", async () => {
  const out = response();
  const db = { query: async () => [[], []] };
  await expect(
    handleAccountRoute({
      method: "POST",
      path: "/api/v1/accounts/verify",
      request: request({ user: "missing" }),
      response: out,
      db,
      auth: { root: true },
    }),
  ).resolves.toBe(true);
  expect(out.status).toBe(503);
});

test("returns healthy when account verification finds grants", async () => {
  const out = response();
  await expect(
    handleAccountRoute({
      method: "POST",
      path: "/api/v1/accounts/verify",
      request: request({ user: "app" }),
      response: out,
      db: { query: async () => [[{ grant: "GRANT USAGE" }], []] },
      auth: { root: true },
    }),
  ).resolves.toBe(true);
  expect(out.status).toBe(200);
});

test("rejects account access without an account scope", async () => {
  const query = jest.fn();
  for (const [method, path, body] of [
    ["GET", "/api/v1/accounts"],
    ["POST", "/api/v1/accounts/export"],
    ["POST", "/api/v1/accounts/import", { confirm: true }],
    ["POST", "/api/v1/accounts/provision", {}],
    ["POST", "/api/v1/accounts/revoke", {}],
    ["POST", "/api/v1/accounts/verify", {}],
  ]) {
    await expect(
      handleAccountRoute({
        method,
        path,
        request: request(body),
        response: response(),
        db: { query },
        auth: { scopes: [] },
      }),
    ).resolves.toBe(false);
  }
  await expect(
    handleAccountRoute({
      method: "GET",
      path: "/api/v1/accounts",
      request: request(),
      response: response(),
      db: { query },
    }),
  ).resolves.toBe(false);
  expect(query).not.toHaveBeenCalled();
});
