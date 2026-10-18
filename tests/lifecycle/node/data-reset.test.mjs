import { expect, jest, test } from "@jest/globals";
import { join } from "node:path";
import { installMemoryFileSystem } from "../../../test-fixtures/memory-filesystem.mjs";

const __memoryFs = installMemoryFileSystem(jest);
jest.unstable_mockModule("node:fs/promises", () => __memoryFs);
jest.unstable_mockModule("node:fs", () => __memoryFs);
jest.unstable_mockModule("node:os", () => ({ tmpdir: () => "/tmp" }));
const { mkdtemp, mkdir, rm, writeFile } = __memoryFs;
const { createNodeDataReset } = await import("../../../src/lifecycle/node/data-reset.mjs");
const { nodeDataResetOptions } =
  await import("../../../test-fixtures/lifecycle/node-data-reset-options.mjs");

const base = nodeDataResetOptions;
test("uses the default removal implementation for a disposable data directory", async () => {
  const directory = await mkdtemp(join(process.cwd(), "reset-test-"));
  try {
    await mkdir(join(directory, "mysql"));
    await writeFile(join(directory, "mysql", "state"), "x");
    const service = createNodeDataReset(
      base({
        dataDir: directory,
        getStatus: async () => ({ ready: false, values: { wsrep_cluster_status: "non-Primary" } }),
        getRecoveryState: () => null,
      }),
    );
    await service.reset({
      node: "node-a.example.test",
      dataDir: directory,
      confirmation: "RESET node-a.example.test",
      dryRun: false,
      idempotencyKey: "default-reset",
    });
    await expect(
      import("node:fs/promises").then(({ access }) => access(join(directory, "mysql"))),
    ).rejects.toBeTruthy();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test("permits healthy target resync only after supervisor fencing", async () => {
  const fence = jest.fn();
  const excludeRouting = jest.fn();
  const stop = jest.fn();
  const remove = jest.fn();
  const restart = jest.fn();
  const service = createNodeDataReset(
    base({
      getStatus: async () => ({
        ready: true,
        values: {
          wsrep_local_state_comment: "Synced",
          wsrep_ready: "ON",
          wsrep_cluster_status: "Primary",
        },
      }),
      getDonors: async () => [{ node: "node-b.example.test", healthy: true, primary: true }],
      fence,
      excludeRouting,
      isFenced: async () => true,
      isRoutingExcluded: async () => true,
      stop,
      remove,
      restart,
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
      recoveryDisposition: "single-member-resync",
      confirmation: "RESET node-a.example.test",
      idempotencyKey: "healthy-resync",
    }),
  ).resolves.toMatchObject({ next: "re-included" });
  expect(fence).toHaveBeenCalled();
  expect(excludeRouting).toHaveBeenCalled();
  expect(stop).toHaveBeenCalled();
  expect(remove).toHaveBeenCalled();
});
test("fails closed for identity, path, confirmation, readiness, quorum, and initialized-data guards", async () => {
  const service = createNodeDataReset(base());
  for (const request of [
    { node: "other", dataDir: "C:/data", confirmation: "RESET node-a.example.test" },
    { node: "node-a.example.test", dataDir: "C:/other", confirmation: "RESET node-a.example.test" },
    { node: "node-a.example.test", dataDir: "C:/data", confirmation: "wrong" },
    { node: "node-a.example.test", dataDir: "C:/data", confirmation: "RESET node-a.example.test" },
    {
      node: "node-a.example.test",
      dataDir: "C:/data",
      confirmation: "RESET node-a.example.test",
      force: true,
      idempotencyKey: "missing-disposition",
    },
  ])
    await expect(service.reset(request)).rejects.toBeTruthy();
  await expect(
    createNodeDataReset(base({ getStatus: async () => ({ ready: true }) })).reset({
      node: "node-a.example.test",
      dataDir: "C:/data",
      confirmation: "RESET node-a.example.test",
      idempotencyKey: "ready",
    }),
  ).rejects.toThrow("healthy");
  await expect(
    createNodeDataReset(base({ getRecoveryState: () => ({ state: "blocked-ambiguous" }) })).reset({
      node: "node-a.example.test",
      dataDir: "C:/data",
      confirmation: "RESET node-a.example.test",
      idempotencyKey: "ambiguous",
    }),
  ).rejects.toThrow("ambiguous");
});
test("selects a deterministic donor when multiple healthy Primaries are available and reports failed rejoin", async () => {
  const request = {
    node: "node-a.example.test",
    dataDir: "C:/data",
    force: true,
    fenced: true,
    routingExcluded: true,
    recoveryDisposition: "single-member-resync",
    confirmation: "RESET node-a.example.test",
    idempotencyKey: "ambiguous-donor",
    dryRun: true,
  };
  await expect(
    createNodeDataReset(
      nodeDataResetOptions({
        getDonors: async () => [
          { node: "node-c.example.test", healthy: true, primary: true },
          { node: "node-b.example.test", healthy: true, primary: true },
        ],
      }),
    ).reset(request),
  ).resolves.toMatchObject({ donor: "node-b.example.test" });
  const service = createNodeDataReset(
    nodeDataResetOptions({
      getDonors: async () => [{ node: "node-b.example.test", healthy: true, primary: true }],
      restart: jest.fn(),
      remove: jest.fn(),
      waitForRejoin: jest.fn().mockRejectedValue(new Error("SST failed")),
    }),
  );
  await expect(
    service.reset({ ...request, idempotencyKey: "failed-rejoin", dryRun: false }),
  ).rejects.toThrow("SST failed");
});

test("performs fenced single-member resync through restart, verification, and reinclusion", async () => {
  const remove = jest.fn();
  const stop = jest.fn();
  const restart = jest.fn();
  const reinclude = jest.fn();
  const service = createNodeDataReset(
    nodeDataResetOptions({
      getDonors: async () => [{ node: "node-b.example.test", healthy: true, primary: true }],
      remove,
      stop,
      restart,
      waitForRejoin: jest.fn(async () => ({
        values: {
          wsrep_local_state_comment: "Synced",
          wsrep_ready: "ON",
          wsrep_cluster_status: "Primary",
        },
      })),
      reinclude,
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
      idempotencyKey: "resync-1",
    }),
  ).resolves.toMatchObject({ recoveryDisposition: "single-member-resync", next: "re-included" });
  expect(stop).toHaveBeenCalled();
  expect(remove).toHaveBeenCalled();
  expect(restart).toHaveBeenCalled();
  expect(reinclude).toHaveBeenCalled();
});
