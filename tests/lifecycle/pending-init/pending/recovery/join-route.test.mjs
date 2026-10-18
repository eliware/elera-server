import { expect, test } from "@jest/globals";
import { handlePendingRecoveryJoinRoute } from "../../../../../src/lifecycle/pending-init/pending/recovery/join-route.mjs";

const request = (body) => ({
  method: "POST",
  url: "/api/v1/cluster/cold-recovery/join",
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
const options = (overrides = {}) => ({
  request: request({ node: "peer.example.test" }),
  response: response(),
  identity: { name: "node.example.test" },
  members: [{ name: "peer.example.test" }],
  onJoin: async (body) => body,
  ...overrides,
});

test("accepts a configured peer and rejects invalid targets", async () => {
  const accepted = options();
  await expect(handlePendingRecoveryJoinRoute(accepted)).resolves.toBe(true);
  expect(accepted.response.status).toBe(202);
  for (const [body, status] of [
    [{ node: "bad" }, 400],
    [{ node: "node.example.test" }, 409],
    [{ node: "other.example.test" }, 400],
  ]) {
    const rejected = options({ request: request(body) });
    await handlePendingRecoveryJoinRoute(rejected);
    expect(rejected.response.status).toBe(status);
  }
});

test("reports malformed requests and join errors", async () => {
  const malformed = options({
    request: {
      ...request({}),
      [Symbol.asyncIterator]() {
        return {
          next: async () => {
            throw new Error("bad body");
          },
        };
      },
    },
  });
  await handlePendingRecoveryJoinRoute(malformed);
  expect(malformed.response.status).toBe(400);
  const failed = options({
    onJoin: async () => {
      throw new Error("join failed");
    },
  });
  await handlePendingRecoveryJoinRoute(failed);
  expect(failed.response.status).toBe(409);
  await expect(
    handlePendingRecoveryJoinRoute({ request: { method: "GET", url: "/join" } }),
  ).resolves.toBe(false);
});
