import { expect, jest, test } from "@jest/globals";
import { createNodeDataReset } from "../../../../src/lifecycle/node/data-reset.mjs";
import { nodeDataResetOptions } from "../../../../test-fixtures/lifecycle/node-data-reset-options.mjs";
import { validateNodeDataReset } from "../../../../src/lifecycle/node/reset/validation.mjs";

const base = {
  node: "node-a.example.test",
  expectedPath: "C:\\data",
  request: {
    node: "node-a.example.test",
    dataDir: "C:\\data",
    confirmation: "RESET node-a.example.test",
    dryRun: true,
  },
  getStatus: async () => ({ values: {} }),
};
test("validates a dry-run reset request", async () => {
  await expect(validateNodeDataReset()).rejects.toThrow("RESET undefined");
  await expect(validateNodeDataReset(base)).resolves.toMatchObject({
    dryRun: true,
    resync: false,
    initialized: false,
  });
});
test("rejects unsafe or malformed requests", async () => {
  await expect(
    validateNodeDataReset({ ...base, request: { ...base.request, node: "node-b.example.test" } }),
  ).rejects.toThrow("identity");
  await expect(
    validateNodeDataReset({ ...base, request: { ...base.request, confirmation: "wrong" } }),
  ).rejects.toThrow("confirmation");
  await expect(
    validateNodeDataReset({ ...base, request: { ...base.request, dryRun: "yes" } }),
  ).rejects.toThrow("boolean");
  await expect(
    validateNodeDataReset({ ...base, request: { ...base.request, dryRun: false } }),
  ).rejects.toThrow("idempotencyKey");
  await expect(
    validateNodeDataReset({ ...base, request: { ...base.request, dataDir: "C:\\other" } }),
  ).rejects.toThrow("data directory");
});
test("supports offline recovery and resync validation", async () => {
  const getStatus = jest.fn().mockRejectedValue(new Error("offline"));
  await expect(
    validateNodeDataReset({
      ...base,
      getStatus,
      offlineRecovery: true,
      request: {
        ...base.request,
        dryRun: true,
        offline: true,
        recoveryDisposition: "single-member-resync",
      },
    }),
  ).resolves.toMatchObject({ resync: true });
});
test("covers executing, default, and status edge conditions", async () => {
  await expect(
    validateNodeDataReset({
      ...base,
      request: {
        node: "node-a.example.test",
        dataDir: "C:\\data",
        confirmation: "RESET node-a.example.test",
        idempotencyKey: "key",
      },
      getRecoveryState: () => null,
    }),
  ).resolves.toMatchObject({ dryRun: false, key: "key" });
  await expect(
    validateNodeDataReset({
      ...base,
      request: { ...base.request, dryRun: false, idempotencyKey: "key" },
      getStatus: async () => ({ values: { wsrep_local_state_comment: "Synced" } }),
    }),
  ).rejects.toThrow("healthy");
  await expect(
    validateNodeDataReset({
      ...base,
      request: { ...base.request, dryRun: false, idempotencyKey: "key" },
      getStatus: async () => ({ values: { wsrep_cluster_status: "Primary" } }),
    }),
  ).rejects.toThrow("healthy");
  await expect(
    validateNodeDataReset({
      ...base,
      getStatus: async () => {
        throw new Error("offline");
      },
    }),
  ).rejects.toThrow("offline");
});
test("rejects healthy, ambiguous, and unsafe initialized nodes", async () => {
  await expect(
    validateNodeDataReset({ ...base, getStatus: async () => ({ ready: true, values: {} }) }),
  ).rejects.toThrow("healthy");
  await expect(
    validateNodeDataReset({ ...base, getRecoveryState: () => ({ state: "awaiting-quorum" }) }),
  ).rejects.toThrow("ambiguous");
  await expect(
    validateNodeDataReset({ ...base, getStatus: async () => ({ initialized: true, values: {} }) }),
  ).rejects.toThrow("initialized");
  await expect(
    validateNodeDataReset({
      ...base,
      getStatus: async () => ({ values: {}, recovery: { state: "blocked-ambiguous" } }),
    }),
  ).rejects.toThrow("ambiguous");
  await expect(
    validateNodeDataReset({
      ...base,
      request: { ...base.request, force: true, recoveryDisposition: "reset-initialized-data" },
      getStatus: async () => ({ initialized: true, values: {} }),
    }),
  ).resolves.toMatchObject({ initialized: true });
});

test("validates required reset dependencies and request types", async () => {
  expect(() => createNodeDataReset()).toThrow("required");
  const service = createNodeDataReset(nodeDataResetOptions());
  await expect(
    service.reset({
      node: "node-a.example.test",
      dataDir: "C:/other",
      confirmation: "RESET node-a.example.test",
    }),
  ).rejects.toThrow("data directory");
  await expect(
    service.reset({
      node: "node-a.example.test",
      confirmation: "RESET node-a.example.test",
      dryRun: "yes",
    }),
  ).rejects.toThrow("dryRun");
});

test("rejects an omitted reset request safely", async () => {
  await expect(createNodeDataReset(nodeDataResetOptions()).reset()).rejects.toThrow(
    "node identity",
  );
});

test("plans reset without stopping or removing data", async () => {
  const stop = jest.fn();
  const remove = jest.fn();
  const result = await createNodeDataReset(nodeDataResetOptions({ stop, remove })).reset({
    node: "node-a.example.test",
    dataDir: "C:/data",
    dryRun: true,
    force: true,
    recoveryDisposition: "reset-initialized-data",
    confirmation: "RESET node-a.example.test",
  });
  expect(result.status).toBe("planned");
  expect(stop).not.toHaveBeenCalled();
  expect(remove).not.toHaveBeenCalled();
});

test("executes confirmed initialized reset and replays idempotently", async () => {
  const stop = jest.fn();
  const remove = jest.fn();
  const audit = { reset: jest.fn() };
  const service = createNodeDataReset(nodeDataResetOptions({ stop, remove, audit }));
  const request = {
    node: "node-a.example.test",
    dataDir: "C:/data",
    dryRun: false,
    force: true,
    recoveryDisposition: "reset-initialized-data",
    confirmation: "RESET node-a.example.test",
    idempotencyKey: "reset-1",
  };
  await expect(service.reset(request)).resolves.toMatchObject({
    status: "completed",
    initialized: true,
  });
  await expect(service.reset(request)).resolves.toMatchObject({ status: "completed" });
  expect(stop).toHaveBeenCalledTimes(1);
  expect(remove).toHaveBeenCalledTimes(1);
  expect(audit.reset).toHaveBeenCalledTimes(1);
});

test("executes a reset for an already fenced empty node", async () => {
  const service = createNodeDataReset(
    nodeDataResetOptions({
      getStatus: async () => ({ ready: false, values: {} }),
      stop: jest.fn(),
      remove: jest.fn(),
    }),
  );
  await expect(
    service.reset({
      node: "node-a.example.test",
      dataDir: "C:/data",
      confirmation: "RESET node-a.example.test",
      idempotencyKey: "empty-reset",
    }),
  ).resolves.toMatchObject({ initialized: false });
});
