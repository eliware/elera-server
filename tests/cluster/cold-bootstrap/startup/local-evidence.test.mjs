import { expect, test } from "@jest/globals";
import { createStartupLocalEvidence } from "../../../../src/cluster/cold-bootstrap/startup/local-evidence.mjs";
const nodeName = "a.example.test";

test("reads persisted state and recovers an unavailable sequence number", async () => {
  const evidence = createStartupLocalEvidence({
    node: { name: nodeName },
    dataDir: "x",
    readState: async () => ({ uuid: "c", seqno: -1, safeToBootstrap: false }),
    runRecover: async () => "Recovered position: c:42",
  });
  await expect(evidence()).resolves.toMatchObject({
    node: nodeName,
    state: { uuid: "c", seqno: 42 },
  });
});

test("requires evidence dependencies", () =>
  expect(() => createStartupLocalEvidence({ node: { name: nodeName }, dataDir: "x" })).toThrow(
    "startup local data dependencies require a FQDN identity",
  ));
test("requires an options object", () =>
  expect(() => createStartupLocalEvidence()).toThrow(
    "startup local data dependencies require a FQDN identity",
  ));

test("preserves a valid persisted sequence number without recovery", async () => {
  const runRecover = async () => {
    throw new Error("must not run");
  };
  const evidence = createStartupLocalEvidence({
    node: { name: nodeName },
    dataDir: "x",
    readState: async () => ({ uuid: "c", seqno: 7, safeToBootstrap: false }),
    runRecover,
  });
  await expect(evidence()).resolves.toMatchObject({ state: { seqno: 7 } });
});

test("does not recover while the local database process is active", async () => {
  const runRecover = async () => {
    throw new Error("must not run");
  };
  const evidence = createStartupLocalEvidence({
    node: { name: nodeName },
    dataDir: "x",
    readState: async () => ({ uuid: "c", seqno: -1, safeToBootstrap: false }),
    runRecover,
    isActive: () => true,
  });
  await expect(evidence()).resolves.toMatchObject({
    node: nodeName,
    active: true,
    state: { seqno: -1 },
  });
});

test("includes Galera status for an active startup peer", async () => {
  const evidence = createStartupLocalEvidence({
    node: { name: nodeName },
    dataDir: "x",
    readState: async () => ({ uuid: "c", seqno: 7, safeToBootstrap: false }),
    runRecover: async () => "Recovered position: c:42",
    health: {
      status: async () => ({
        ready: true,
        values: {
          wsrep_cluster_state_uuid: "cluster-id",
          wsrep_cluster_status: "Primary",
          wsrep_local_state_comment: "Synced",
          wsrep_ready: "ON",
          wsrep_cluster_size: "3",
        },
      }),
    },
    isActive: () => true,
  });
  await expect(evidence()).resolves.toMatchObject({
    node: nodeName,
    active: true,
    galera: {
      clusterUuid: "cluster-id",
      clusterStatus: "Primary",
      localState: "Synced",
      ready: "ON",
      clusterSize: 3,
    },
  });
});

test("keeps active evidence when the health status read fails", async () => {
  const evidence = createStartupLocalEvidence({
    node: { name: nodeName },
    dataDir: "x",
    readState: async () => ({ uuid: "c", seqno: 7, safeToBootstrap: false }),
    runRecover: async () => "Recovered position: c:42",
    health: {
      status: async () => {
        throw new Error("health unavailable");
      },
    },
    isActive: () => true,
  });
  const result = await evidence();
  expect(result).toMatchObject({ node: nodeName, active: true });
  expect(result).not.toHaveProperty("galera");
});

test("includes protocol freshness metadata and preserves both sequence numbers", async () => {
  const evidence = createStartupLocalEvidence({
    node: { name: nodeName },
    dataDir: "x",
    readState: async () => ({ uuid: "c", seqno: -1, safeToBootstrap: false }),
    runRecover: async () => "Recovered position: c:42",
  });
  await expect(evidence()).resolves.toMatchObject({
    generation: 1,
    observedAt: expect.any(String),
    state: { savedSeqno: -1, recoveredSeqno: 42, seqno: 42 },
  });
  await expect(evidence()).resolves.toMatchObject({ generation: 2, state: { recoveredSeqno: 42 } });
});

test("fails closed when recovery cannot report a sequence number", async () => {
  const evidence = createStartupLocalEvidence({
    node: { name: nodeName },
    dataDir: "x",
    readState: async () => ({ uuid: "c", seqno: -1, safeToBootstrap: false }),
    runRecover: async () => "no recovered position",
  });
  await expect(evidence()).rejects.toThrow("wsrep-recover did not report a value");
});

test("does not rerun a failed wsrep recovery probe for every evidence request", async () => {
  let calls = 0;
  const evidence = createStartupLocalEvidence({
    node: { name: nodeName },
    dataDir: "x",
    readState: async () => ({ uuid: "c", seqno: -1, safeToBootstrap: false }),
    runRecover: async () => {
      calls += 1;
      throw new Error("recover unavailable");
    },
  });
  await expect(evidence()).rejects.toThrow("recover unavailable");
  await expect(evidence()).rejects.toThrow("recover unavailable");
  expect(calls).toBe(1);
});

test("shares one in-flight wsrep recovery probe across concurrent evidence requests", async () => {
  let calls = 0;
  let release;
  const evidence = createStartupLocalEvidence({
    node: { name: nodeName },
    dataDir: "x",
    readState: async () => ({ uuid: "c", seqno: -1, safeToBootstrap: false }),
    runRecover: async () => {
      calls += 1;
      await new Promise((resolve) => {
        release = resolve;
      });
      return "Recovered position: c:42";
    },
  });
  const first = evidence();
  const second = evidence();
  await Promise.resolve();
  expect(calls).toBe(1);
  release();
  await expect(Promise.all([first, second])).resolves.toHaveLength(2);
});
