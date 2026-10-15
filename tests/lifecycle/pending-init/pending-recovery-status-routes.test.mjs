import { expect, test } from "@jest/globals";
import { handlePendingRecoveryStatusRoute } from "../../../src/lifecycle/pending-init/pending-recovery-status-routes.mjs";

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

test("serves recovery status and evidence with fallback data", async () => {
  for (const [path, value] of [
    ["status", { phase: "blocked", reason: "blocked" }],
    ["evidence", []],
  ]) {
    const out = response();
    const method = path === "status" ? "status" : "evidence";
    await expect(
      handlePendingRecoveryStatusRoute({
        request: request("GET", `/api/v1/cluster/cold-recovery/${path}`),
        response: out,
        recoveryReason: "blocked",
        protocol: { [method]: async () => undefined },
      }),
    ).resolves.toBe(true);
    expect(out.status).toBe(200);
    expect(out.body).toContain(JSON.stringify(value));
  }
});

test("returns service errors and ignores other requests", async () => {
  for (const path of ["status", "evidence"]) {
    const out = response();
    await handlePendingRecoveryStatusRoute({
      request: request("GET", `/api/v1/cluster/cold-recovery/${path}`),
      response: out,
      protocol: {
        [path]: async () => {
          throw Object.assign(new Error("failed"), { code: "E" });
        },
      },
    });
    expect(out.status).toBe(503);
  }
  await expect(
    handlePendingRecoveryStatusRoute({ request: request("POST", "/status") }),
  ).resolves.toBe(false);
});
