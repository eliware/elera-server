import { expect, jest, test } from "@jest/globals";
import { handleTrafficRoute } from "../../../src/api/routes/traffic.mjs";

test("reports traffic and toggles drain state", async () => {
  const response = { json: jest.fn() };
  const getTraffic = jest.fn(() => ({ active: 3 }));
  const setDrain = jest.fn();
  await expect(
    handleTrafficRoute({
      method: "GET",
      path: "/api/v1/traffic/status",
      response,
      getTraffic,
      setDrain,
      auth: { root: true },
    }),
  ).resolves.toBe(true);
  await expect(
    handleTrafficRoute({
      method: "POST",
      path: "/api/v1/traffic/drain",
      request: { headers: { "x-elera-drain-propagated": "true" } },
      response,
      getTraffic,
      setDrain,
      auth: { root: true },
    }),
  ).resolves.toBe(true);
  await expect(
    handleTrafficRoute({
      method: "POST",
      path: "/api/v1/traffic/undrain",
      request: { headers: {} },
      response,
      getTraffic,
      setDrain,
      auth: { root: true },
    }),
  ).resolves.toBe(true);
  expect(getTraffic).toHaveBeenCalled();
  expect(setDrain).toHaveBeenNthCalledWith(1, true, true);
  expect(setDrain).toHaveBeenNthCalledWith(2, false, false);
});

test("requires management scopes for traffic operations", async () => {
  const context = { response: { json: jest.fn() }, getTraffic: () => ({}), setDrain: jest.fn() };
  await expect(
    handleTrafficRoute({
      ...context,
      method: "GET",
      path: "/api/v1/traffic/status",
      auth: { scopes: [] },
    }),
  ).rejects.toMatchObject({ statusCode: 403 });
  await expect(
    handleTrafficRoute({
      ...context,
      method: "POST",
      path: "/api/v1/traffic/drain",
      auth: { scopes: ["cluster:read"] },
    }),
  ).rejects.toMatchObject({ statusCode: 403 });
  await expect(
    handleTrafficRoute({
      ...context,
      method: "POST",
      path: "/api/v1/traffic/undrain",
      auth: { scopes: ["cluster:read"] },
    }),
  ).rejects.toMatchObject({ statusCode: 403 });
});

test("ignores unsupported traffic routes", async () => {
  await expect(
    handleTrafficRoute({
      method: "GET",
      path: "/other",
      response: { json: jest.fn() },
      setDrain: jest.fn(),
    }),
  ).resolves.toBe(false);
});
