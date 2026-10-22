import { expect, test, jest } from "@jest/globals";
import { handleRoutingResyncRoute } from "../../../../src/api/routes/routing/resync.mjs";

test("resyncs the requested application and rejects unrelated requests", () => {
  const response = { json: jest.fn() };
  const getEvent = jest.fn(() => ({ type: "routing.update" }));
  expect(
    handleRoutingResyncRoute({
      method: "POST",
      path: "/api/v1/routing/resync",
      url: new URL("http://localhost/api/v1/routing/resync"),
      response,
      getEvent,
      auth: { root: true },
    }),
  ).toBe(true);
  expect(getEvent).toHaveBeenCalledWith("default");
  expect(
    handleRoutingResyncRoute({
      method: "GET",
      path: "/api/v1/routing/resync",
      url: new URL("http://localhost"),
      response,
      getEvent,
    }),
  ).toBe(false);
});

test("serves the current routing event and ignores other routes", () => {
  expect(handleRoutingResyncRoute()).toBe(false);
  const json = jest.fn();
  const event = { type: "routing.update", version: 3 };
  expect(
    handleRoutingResyncRoute({
      method: "POST",
      path: "/api/v1/routing/resync",
      url: new URL("http://x/api/v1/routing/resync?application=a"),
      response: { json },
      getEvent: () => event,
      auth: { scopes: ["routing:read"] },
    }),
  ).toBe(true);
  expect(json).toHaveBeenCalledWith(
    200,
    expect.objectContaining({ operation: "routing.resync", data: event }),
  );
  expect(handleRoutingResyncRoute({ method: "GET", path: "/api/v1/routing/resync" })).toBe(false);
});

test("requires routing read scope and limits scoped tokens to their application", async () => {
  const common = {
    method: "POST",
    path: "/api/v1/routing/resync",
    url: new URL("http://x/api/v1/routing/resync?application=other"),
    response: { json: jest.fn() },
    getEvent: jest.fn(),
  };
  await expect(
    Promise.resolve().then(() => handleRoutingResyncRoute({ ...common, auth: { scopes: [] } })),
  ).rejects.toMatchObject({ statusCode: 403 });
  await expect(
    Promise.resolve().then(() =>
      handleRoutingResyncRoute({
        ...common,
        auth: { application: "app", scopes: ["routing:read"] },
      }),
    ),
  ).rejects.toMatchObject({ statusCode: 403 });
});
