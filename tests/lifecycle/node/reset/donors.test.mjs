import { expect, jest, test } from "@jest/globals";
import { createNodeDataReset } from "../../../../src/lifecycle/node/data-reset.mjs";
import { nodeDataResetOptions } from "../../../../test-fixtures/lifecycle/node-data-reset-options.mjs";
import { selectRecoveryDonor } from "../../../../src/lifecycle/node/reset/donors.mjs";

test("selects the first healthy Primary donor deterministically", () => {
  expect(
    selectRecoveryDonor({
      node: "node-a.example.test",
      donors: [
        { node: "node-c.example.test", healthy: true, primary: true },
        { node: "node-b.example.test", healthy: true, primary: true },
        { node: "node-a.example.test", healthy: true, primary: true },
      ],
    }),
  ).toBe("node-b.example.test");
});
test("rejects missing or ineligible donors", () => {
  expect(() => selectRecoveryDonor()).toThrow("healthy Primary donor");
  expect(() => selectRecoveryDonor({ node: "node-a.example.test", donors: [] })).toThrow(
    "healthy Primary donor",
  );
  expect(() => selectRecoveryDonor({ node: "node-a.example.test", donors: null })).toThrow(
    "healthy Primary donor",
  );
  expect(() => selectRecoveryDonor({ node: "node-a.example.test", donors: [null, {}] })).toThrow(
    "healthy Primary donor",
  );
  expect(() =>
    selectRecoveryDonor({
      node: "node-a.example.test",
      donors: [{ node: "node-b.example.test", healthy: false, primary: true }],
    }),
  ).toThrow();
});

test("permits explicit offline resync only with an attested donor", async () => {
  const service = createNodeDataReset(
    nodeDataResetOptions({
      getStatus: async () => {
        throw new Error("socket unavailable");
      },
      offlineRecovery: true,
      getDonors: async () => [],
    }),
  );
  await expect(
    service.reset({
      node: "node-a.example.test",
      dataDir: "C:/data",
      dryRun: true,
      force: true,
      offline: true,
      fenced: true,
      routingExcluded: true,
      donor: { node: "node-b.example.test", healthy: true, primary: true },
      recoveryDisposition: "single-member-resync",
      confirmation: "RESET node-a.example.test",
    }),
  ).resolves.toMatchObject({ next: "rejoin-and-receive-sst" });
});

test("executes an offline resync without a SQL reread", async () => {
  const service = createNodeDataReset(
    nodeDataResetOptions({
      getStatus: async () => {
        throw new Error("socket unavailable");
      },
      offlineRecovery: true,
      remove: jest.fn(),
      restart: jest.fn(),
      waitForRejoin: jest.fn(async () => ({
        values: {
          wsrep_local_state_comment: "Synced",
          wsrep_ready: "ON",
          wsrep_cluster_status: "Primary",
        },
      })),
      reinclude: jest.fn(),
    }),
  );
  await expect(
    service.reset({
      node: "node-a.example.test",
      dataDir: "C:/data",
      force: true,
      offline: true,
      fenced: true,
      routingExcluded: true,
      donor: { node: "node-b.example.test", healthy: true, primary: true },
      recoveryDisposition: "single-member-resync",
      confirmation: "RESET node-a.example.test",
      idempotencyKey: "offline-exec",
    }),
  ).resolves.toMatchObject({ next: "re-included" });
});

test("fails closed when SQL is unavailable without explicit offline recovery", async () => {
  const service = createNodeDataReset(
    nodeDataResetOptions({
      getStatus: async () => {
        throw new Error("socket unavailable");
      },
    }),
  );
  await expect(
    service.reset({
      node: "node-a.example.test",
      dataDir: "C:/data",
      dryRun: true,
      confirmation: "RESET node-a.example.test",
    }),
  ).rejects.toThrow("socket unavailable");
});

test("rejects resync without donor and keeps ordinary reset refusal for live nodes", async () => {
  const request = {
    node: "node-a.example.test",
    dataDir: "C:/data",
    force: true,
    recoveryDisposition: "single-member-resync",
    confirmation: "RESET node-a.example.test",
    idempotencyKey: "bad-resync",
  };
  await expect(createNodeDataReset(nodeDataResetOptions()).reset(request)).rejects.toThrow(
    "healthy Primary donor",
  );
  await expect(
    createNodeDataReset(
      nodeDataResetOptions({
        getDonors: async () => [{ node: "node-b.example.test", healthy: true, primary: true }],
        getStatus: async () => ({ ready: true }),
      }),
    ).reset({
      ...request,
      recoveryDisposition: "reset-initialized-data",
      idempotencyKey: "ordinary-live",
    }),
  ).rejects.toThrow("healthy");
});

test("requires supervisor-verified fencing and routing exclusion", async () => {
  const request = {
    node: "node-a.example.test",
    dataDir: "C:/data",
    force: true,
    recoveryDisposition: "single-member-resync",
    confirmation: "RESET node-a.example.test",
    idempotencyKey: "unsafe-resync",
  };
  const service = createNodeDataReset(
    nodeDataResetOptions({
      getDonors: async () => [{ node: "node-b.example.test", healthy: true, primary: true }],
      remove: jest.fn(),
      isFenced: async () => false,
    }),
  );
  await expect(service.reset(request)).rejects.toThrow("supervisor-verified");
});

test("rejects malformed donor observations", async () => {
  const service = createNodeDataReset(nodeDataResetOptions({ getDonors: async () => null }));
  await expect(
    service.reset({
      node: "node-a.example.test",
      dataDir: "C:/data",
      force: true,
      fenced: true,
      routingExcluded: true,
      recoveryDisposition: "single-member-resync",
      confirmation: "RESET node-a.example.test",
      idempotencyKey: "bad-donors",
    }),
  ).rejects.toThrow("healthy Primary donor");
});
