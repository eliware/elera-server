import { expect, test } from "@jest/globals";
import { handlePendingRecoveryPlanRoute } from "../../../src/lifecycle/pending-init/pending-recovery-plan-routes.mjs";

const response = () => ({
  writeHead(status) {
    this.status = status;
    return this;
  },
  end(body) {
    this.body = body;
    return this;
  },
});
const request = (method, path) => ({ method, url: path });

test("serves plan and retry results", async () => {
  const protocol = { plan: async () => ({ plan: true }), retry: async () => ({ retried: true }) };
  for (const [path, operation] of [
    ["plan", "plan"],
    ["retry", "retry"],
  ]) {
    const out = response();
    await expect(
      handlePendingRecoveryPlanRoute({
        request: request("POST", `/api/v1/cluster/cold-recovery/${path}`),
        response: out,
        protocol,
      }),
    ).resolves.toBe(true);
    expect(out.status).toBe(200);
    expect(out.body).toContain(`cluster.cold-recovery.${operation}`);
  }
});

test("handles missing protocol and operation failures", async () => {
  const unavailable = response();
  await handlePendingRecoveryPlanRoute({
    request: request("POST", "/api/v1/cluster/cold-recovery/plan"),
    response: unavailable,
  });
  expect(unavailable.status).toBe(503);
  for (const [error, status] of [
    [Object.assign(new Error("bad"), { statusCode: 409 }), 409],
    [new Error("bad"), 503],
  ]) {
    const out = response();
    await handlePendingRecoveryPlanRoute({
      request: request("POST", "/api/v1/cluster/cold-recovery/retry"),
      response: out,
      protocol: {
        retry: async () => {
          throw error;
        },
      },
    });
    expect(out.status).toBe(status);
  }
  await expect(handlePendingRecoveryPlanRoute({ request: request("GET", "/plan") })).resolves.toBe(
    false,
  );
});
