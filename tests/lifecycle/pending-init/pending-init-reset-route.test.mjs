import { expect, test } from "@jest/globals";
import { handlePendingInitResetRoute } from "../../../src/lifecycle/pending-init/pending-init-reset-route.mjs";

const request = (body) => ({
  method: "POST",
  url: "/api/v1/node/data/reset",
  async *[Symbol.asyncIterator]() {
    yield JSON.stringify(body);
  },
});
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

test("checks access and service availability", async () => {
  const denied = response();
  await handlePendingInitResetRoute(request({}), denied, { authorized: () => false });
  expect(denied.status).toBe(401);
  const missing = response();
  await handlePendingInitResetRoute(request({}), missing, { authorized: () => true });
  expect(missing.status).toBe(503);
});

test("returns reset results with dry-run and apply status codes", async () => {
  for (const [dryRun, status] of [
    [true, 200],
    [false, 202],
  ]) {
    const out = response();
    await handlePendingInitResetRoute(request({ dryRun }), out, {
      authorized: () => true,
      nodeDataReset: { reset: async (body) => ({ ...body, status: "completed" }) },
    });
    expect(out.status).toBe(status);
  }
});

test("returns reset errors and ignores other paths", async () => {
  for (const [error, status] of [
    [Object.assign(new Error("denied"), { statusCode: 409 }), 409],
    [new Error("failed"), 500],
  ]) {
    const out = response();
    await handlePendingInitResetRoute(request({}), out, {
      authorized: () => true,
      nodeDataReset: {
        reset: async () => {
          throw error;
        },
      },
    });
    expect(out.status).toBe(status);
  }
  await expect(
    handlePendingInitResetRoute({ method: "GET", url: "/api/v1/node/data/reset" }, response(), {}),
  ).resolves.toBe(false);
});
