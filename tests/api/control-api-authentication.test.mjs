import { expect, test, jest } from "@jest/globals";
import { authenticateControlRequest } from "../../src/api/control-api-authentication.mjs";

test("grants root scope for the root token", async () => {
  const result = await authenticateControlRequest(
    { headers: { authorization: "Bearer root" } },
    { token: "root" },
  );
  expect(result).toEqual({ root: true, scopes: ["*"] });
});

test("returns scoped credentials from managed metadata", async () => {
  const scoped = { application: "app", scopes: ["read"] };
  const authenticate = jest.fn(async (token) => (token === "scoped" ? scoped : null));
  const result = await authenticateControlRequest(
    { headers: { authorization: "Bearer scoped" } },
    { token: "root", managed: { authenticate } },
  );
  expect(result).toBe(scoped);
  expect(authenticate).toHaveBeenCalledWith("scoped");
});

test("uses metadata when managed metadata is absent", async () => {
  const scoped = { application: "app", scopes: ["write"] };
  const authenticate = jest.fn(async () => scoped);
  const result = await authenticateControlRequest(
    { headers: { authorization: "Bearer scoped" } },
    { token: "root", metadata: { authenticate } },
  );
  expect(result).toBe(scoped);
  expect(authenticate).toHaveBeenCalledWith("scoped");
});

test("rejects missing and invalid credentials", async () => {
  const managed = { authenticate: jest.fn(async () => null) };
  await expect(
    authenticateControlRequest({ headers: {} }, { token: "root", managed }),
  ).resolves.toBeNull();
  await expect(
    authenticateControlRequest(
      { headers: { authorization: "Bearer scoped" } },
      { token: "root", managed: {} },
    ),
  ).resolves.toBeNull();
  await expect(authenticateControlRequest({ headers: {} })).resolves.toBeNull();
  await expect(
    authenticateControlRequest(
      { headers: { authorization: "Bearer invalid" } },
      { token: "root", managed },
    ),
  ).resolves.toBeNull();
});
