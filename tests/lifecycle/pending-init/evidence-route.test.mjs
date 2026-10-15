import { expect, test } from "@jest/globals";
import { handlePendingInitEvidenceRoute } from "../../../src/lifecycle/pending-init/evidence-route.mjs";

const request = { method: "GET", url: "/api/v1/cluster/cold-bootstrap/evidence" };
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

test("checks access and reports missing evidence service", async () => {
  const denied = response();
  await handlePendingInitEvidenceRoute(request, denied, { authorized: () => false });
  expect(denied.status).toBe(401);
  const missing = response();
  await handlePendingInitEvidenceRoute(request, missing, { authorized: () => true });
  expect(missing.status).toBe(503);
});

test("returns evidence and maps evidence failures", async () => {
  const ok = response();
  await handlePendingInitEvidenceRoute(request, ok, {
    authorized: () => true,
    coldEvidence: async () => [{ node: "node.example.test" }],
  });
  expect(ok.status).toBe(200);
  expect(ok.body).toContain("node.example.test");
  const failed = response();
  await handlePendingInitEvidenceRoute(request, failed, {
    authorized: () => true,
    coldEvidence: async () => {
      throw new Error("unavailable");
    },
  });
  expect(failed.status).toBe(503);
});

test("ignores other requests", async () => {
  await expect(
    handlePendingInitEvidenceRoute({ method: "POST", url: request.url }, response(), {}),
  ).resolves.toBe(false);
});
