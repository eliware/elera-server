import { expect, test, jest } from "@jest/globals";
import { handlePendingInitHealthRoute } from "../../../src/lifecycle/pending-init/health-routes.mjs";

const response = () => ({ writeHead: jest.fn().mockReturnThis(), end: jest.fn().mockReturnThis() });

test("serves health and readiness responses", () => {
  const health = response();
  expect(handlePendingInitHealthRoute({ url: "/healthz" }, health)).toBe(true);
  expect(health.writeHead).toHaveBeenCalledWith(200, { "content-type": "text/plain" });
  expect(health.end).toHaveBeenCalledWith("ok\n");
  const readiness = response();
  expect(handlePendingInitHealthRoute({ url: "/readyz" }, readiness)).toBe(true);
  expect(readiness.writeHead).toHaveBeenCalledWith(503, { "content-type": "text/plain" });
  expect(readiness.end).toHaveBeenCalledWith("not available\n");
});

test("leaves other paths for the server", () => {
  expect(handlePendingInitHealthRoute({ url: "/other" }, response())).toBe(false);
});
