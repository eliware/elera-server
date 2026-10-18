import { expect, jest, test } from "@jest/globals";
import { createNodeDataReset } from "../../../../src/lifecycle/node/data-reset.mjs";
import { nodeDataResetOptions } from "../../../../test-fixtures/lifecycle/node-data-reset-options.mjs";
import { isSyncedPrimary, waitForReady } from "../../../../src/lifecycle/node/reset/readiness.mjs";

const ready = {
  values: {
    wsrep_local_state_comment: "Synced",
    wsrep_ready: "ON",
    wsrep_cluster_status: "Primary",
  },
};
test("recognizes only Synced Primary status", () => {
  expect(isSyncedPrimary(ready)).toBe(true);
  expect(isSyncedPrimary({ values: { ...ready.values, wsrep_ready: "OFF" } })).toBe(false);
  expect(isSyncedPrimary()).toBe(false);
});
test("polls until the node is ready", async () => {
  const getStatus = jest.fn().mockResolvedValueOnce({}).mockResolvedValueOnce(ready);
  const sleep = jest.fn(async () => {});
  await expect(waitForReady({ getStatus, timeoutMs: 100, intervalMs: 1, sleep })).resolves.toBe(
    ready,
  );
  expect(getStatus).toHaveBeenCalledTimes(2);
});
test("continues after status errors and fails at the deadline", async () => {
  const getStatus = jest.fn().mockRejectedValue(new Error("offline"));
  const sleep = jest.fn(async () => {});
  await expect(
    waitForReady({
      getStatus,
      timeoutMs: 0,
      intervalMs: 1,
      sleep,
      failure: (message, status) => Object.assign(new Error(message), { status }),
    }),
  ).rejects.toMatchObject({ status: 504 });
});
test("uses default sleep and failure dependencies", async () => {
  await expect(
    waitForReady({ getStatus: async () => ({}), timeoutMs: 0, intervalMs: 1 }),
  ).rejects.toThrow("single-member-resync");
});

test("supports the default restart and reinclusion hooks for resync", async () => {
  const service = createNodeDataReset(
    nodeDataResetOptions({
      getDonors: async () => [{ node: "node-b.example.test", healthy: true, primary: true }],
      remove: jest.fn(),
      waitForRejoin: jest.fn(async () => ({
        values: {
          wsrep_local_state_comment: "Synced",
          wsrep_ready: "ON",
          wsrep_cluster_status: "Primary",
        },
      })),
    }),
  );
  await expect(
    service.reset({
      node: "node-a.example.test",
      dataDir: "C:/data",
      force: true,
      fenced: true,
      routingExcluded: true,
      recoveryDisposition: "single-member-resync",
      confirmation: "RESET node-a.example.test",
      idempotencyKey: "default-restart",
    }),
  ).resolves.toMatchObject({ next: "re-included" });
});

test("waits for a real Synced Primary before reinclusion", async () => {
  let attempts = 0;
  const reinclude = jest.fn();
  const service = createNodeDataReset(
    nodeDataResetOptions({
      getDonors: async () => [{ node: "node-b.example.test", healthy: true, primary: true }],
      remove: jest.fn(),
      restart: jest.fn(),
      reinclude,
      resyncTimeoutMs: 50,
      resyncPollMs: 1,
      getStatus: async () =>
        ++attempts > 1
          ? {
              values: {
                wsrep_local_state_comment: "Synced",
                wsrep_ready: "ON",
                wsrep_cluster_status: "Primary",
              },
            }
          : { values: { wsrep_local_state_comment: "Joining" } },
    }),
  );
  await expect(
    service.reset({
      node: "node-a.example.test",
      dataDir: "C:/data",
      force: true,
      fenced: true,
      routingExcluded: true,
      recoveryDisposition: "single-member-resync",
      confirmation: "RESET node-a.example.test",
      idempotencyKey: "poll-resync",
    }),
  ).resolves.toMatchObject({ next: "re-included" });
  expect(reinclude).toHaveBeenCalled();
});

test("fails if the rejoin verifier returns a non-ready view", async () => {
  const service = createNodeDataReset(
    nodeDataResetOptions({
      getDonors: async () => [{ node: "node-b.example.test", healthy: true, primary: true }],
      remove: jest.fn(),
      waitForRejoin: jest
        .fn()
        .mockResolvedValue({ values: { wsrep_local_state_comment: "Joining" } }),
    }),
  );
  await expect(
    service.reset({
      node: "node-a.example.test",
      dataDir: "C:/data",
      force: true,
      fenced: true,
      routingExcluded: true,
      recoveryDisposition: "single-member-resync",
      confirmation: "RESET node-a.example.test",
      idempotencyKey: "bad-view",
    }),
  ).rejects.toThrow("completed without an available Primary view");
});

test("fails safely when the post-fence status reread is unavailable", async () => {
  let calls = 0;
  const service = createNodeDataReset(
    nodeDataResetOptions({
      getDonors: async () => [{ node: "node-b.example.test", healthy: true, primary: true }],
      remove: jest.fn(),
      getStatus: async () => {
        calls += 1;
        if (calls > 1) throw new Error("starting");
        return { values: { wsrep_local_state_comment: "Joining" } };
      },
      resyncTimeoutMs: 1,
      resyncPollMs: 1,
    }),
  );
  await expect(
    service.reset({
      node: "node-a.example.test",
      dataDir: "C:/data",
      force: true,
      fenced: true,
      routingExcluded: true,
      recoveryDisposition: "single-member-resync",
      confirmation: "RESET node-a.example.test",
      idempotencyKey: "reread-failed",
    }),
  ).rejects.toThrow("starting");
});

test("times out safely when a fenced target never rejoins", async () => {
  let calls = 0;
  const service = createNodeDataReset(
    nodeDataResetOptions({
      getDonors: async () => [{ node: "node-b.example.test", healthy: true, primary: true }],
      remove: jest.fn(),
      resyncTimeoutMs: 50,
      resyncPollMs: 1,
      getStatus: async () => {
        calls += 1;
        if (calls > 3) throw new Error("transient status error");
        return { values: { wsrep_local_state_comment: "Joining" } };
      },
    }),
  );
  await expect(
    service.reset({
      node: "node-a.example.test",
      dataDir: "C:/data",
      force: true,
      fenced: true,
      routingExcluded: true,
      recoveryDisposition: "single-member-resync",
      confirmation: "RESET node-a.example.test",
      idempotencyKey: "rejoin-timeout",
    }),
  ).rejects.toThrow("before timeout");
});
