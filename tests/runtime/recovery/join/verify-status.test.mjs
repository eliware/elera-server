import { expect, jest, test } from "@jest/globals";
import { verifyRecoveryJoiner } from "../../../../src/runtime/recovery/join/verify-status.mjs";

const joiner = { name: "node-b.example.test", address: "node-b.example.test" };
const members = [{ name: "node-a.example.test" }, joiner];
const readyStatus = {
  wsrep_cluster_state_uuid: "c",
  wsrep_cluster_size: "2",
  wsrep_local_state_comment: "Synced",
  wsrep_ready: "ON",
  wsrep_cluster_status: "Primary",
};
const verify = (response, overrides = {}) =>
  verifyRecoveryJoiner({
    joiner,
    members,
    bootstrap: { clusterId: "c" },
    token: "secret",
    timeoutMs: 100,
    fetchImpl: jest.fn(async () => response),
    ...overrides,
  });

test("verifies nested status and supports a custom URL and port", async () => {
  const fetchImpl = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, data: { values: readyStatus } }),
  }));
  const result = await verifyRecoveryJoiner({
    joiner: { ...joiner, url: "http://custom/" },
    fetchImpl,
    token: "secret",
    timeoutMs: 100,
    httpPort: 9090,
    bootstrap: { clusterId: "c" },
    members,
  });
  expect(result).toMatchObject({ valid: true, node: joiner.name });
  expect(fetchImpl.mock.calls[0][0]).toBe("http://custom/api/v1/cluster/status");
  expect(fetchImpl.mock.calls[0][1].headers.authorization).toBe("Bearer secret");
});

test("accepts direct status data and the configured HTTP port", async () => {
  const fetchImpl = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ data: readyStatus }),
  }));
  await verifyRecoveryJoiner({ joiner, members, fetchImpl, timeoutMs: 100, httpPort: 9090 });
  expect(fetchImpl.mock.calls[0][0]).toBe(`http://${joiner.address}:9090/api/v1/cluster/status`);
});

test("rejects non-ready, missing, and unsuccessful status responses", async () => {
  await expect(
    verify({
      ok: true,
      status: 200,
      json: async () => ({ data: { ...readyStatus, wsrep_ready: "OFF" } }),
    }),
  ).resolves.toMatchObject({ valid: false, node: joiner.name });
  await expect(
    verify({ ok: true, status: 200, json: async () => ({ ok: true }) }),
  ).resolves.toMatchObject({
    valid: false,
  });
  await expect(
    verify({ ok: false, status: 503, json: async () => ({ error: "offline" }) }),
  ).resolves.toEqual({
    valid: false,
    node: joiner.name,
    reason: "offline",
  });
  await expect(
    verify({
      ok: false,
      status: 503,
      json: async () => {
        throw new Error("invalid JSON");
      },
    }),
  ).resolves.toEqual({ valid: false, node: joiner.name, reason: "cluster status returned 503" });
  await expect(
    verify({ ok: true, status: 200, json: async () => ({ ok: false, error: "not ready" }) }),
  ).resolves.toEqual({ valid: false, node: joiner.name, reason: "not ready" });
});
