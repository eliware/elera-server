import { expect, jest, test } from "@jest/globals";
import { createQuorumAssignmentCoordinator } from "../../src/routing/quorum-assignment.mjs";
import { createObservationStore } from "../../src/cluster/observation-store.mjs";
import { evaluateQuorum } from "../../src/cluster/quorum.mjs";
import { calculateRoutes } from "../../src/routing/decision.mjs";

const healthy = (overrides = {}) => ({
  nodeId: "node-a.example.test",
  clusterId: "c",
  state: "Synced",
  synced: true,
  primary: "Primary",
  health: "ok",
  address: "node-a.example.test",
  observedAt: 100,
  ...overrides,
});
const context = (observations = [healthy()]) => ({
  assignmentStore: {
    get: jest.fn(async () => undefined),
    set: jest.fn(async (_application, writer) => writer),
  },
  observationStore: { snapshot: () => observations },
  environment: { ELERA_CLUSTER_SIZE: "1" },
  now: () => 100,
});

test("persists assignments only while quorum and target eligibility hold", async () => {
  const value = context();
  const coordinator = createQuorumAssignmentCoordinator(value);
  await expect(coordinator.write("payments", "node-a.example.test")).resolves.toBe(
    "node-a.example.test",
  );
  expect(value.assignmentStore.set).toHaveBeenCalledWith("payments", "node-a.example.test");
});

test("refuses assignment without quorum or to an ineligible target", async () => {
  await expect(
    createQuorumAssignmentCoordinator({
      ...context(),
      environment: { ELERA_CLUSTER_SIZE: "3" },
    }).write("app", "node-a.example.test"),
  ).rejects.toMatchObject({ code: "QUORUM_REQUIRED" });
  await expect(
    createQuorumAssignmentCoordinator(context([healthy({ synced: false })])).write(
      "app",
      "node-a.example.test",
    ),
  ).rejects.toMatchObject({ code: "WRITER_INELIGIBLE" });
  await expect(
    createQuorumAssignmentCoordinator(context([healthy({ drain: true })])).write(
      "app",
      "node-a.example.test",
    ),
  ).rejects.toMatchObject({ code: "WRITER_INELIGIBLE" });
});

test("requires assignment dependencies and reports persistence errors", async () => {
  expect(() => createQuorumAssignmentCoordinator()).toThrow("dependencies");
  const value = context();
  value.assignmentStore.set.mockRejectedValue(new Error("storage"));
  const coordinator = createQuorumAssignmentCoordinator({ ...value, log: { error: jest.fn() } });
  await expect(coordinator.write("app", "node-a.example.test")).rejects.toThrow("storage");
  expect(await coordinator.read("app")).toBeUndefined();
});

test("rethrows persistence errors when no error logger is configured", async () => {
  const value = context();
  value.assignmentStore.set.mockRejectedValue(new Error("storage unavailable"));
  await expect(
    createQuorumAssignmentCoordinator(value).write("app", "node-a.example.test"),
  ).rejects.toThrow("storage unavailable");
});

test("derives quorum size from observations when no cluster size is configured", async () => {
  const value = context();
  const coordinator = createQuorumAssignmentCoordinator({ ...value, environment: {} });
  await expect(coordinator.write("app", "node-a.example.test")).resolves.toBe(
    "node-a.example.test",
  );
});

const observation = (nodeId, overrides = {}) => ({
  nodeId,
  clusterId: "elera",
  state: "Synced",
  synced: true,
  primary: "Primary",
  health: "ok",
  address: `${nodeId}.elera`,
  sqlPort: 3306,
  observedAt: 100,
  ...overrides,
});
const stores = () => [
  createObservationStore({ now: () => 100 }),
  createObservationStore({ now: () => 100 }),
  createObservationStore({ now: () => 100 }),
];

test("three supervisors converge on a writer while preserving reader candidates", async () => {
  const shared = new Map();
  const nodes = ["elera-0.cluster.local", "elera-1.cluster.local", "elera-2.cluster.local"];
  const observations = nodes.map((node) => observation(node));
  const storesForSupervisors = stores();
  storesForSupervisors.forEach((store) => observations.forEach((item) => store.upsert(item)));
  const routes = calculateRoutes({
    application: "payments",
    observations,
    now: 100,
  });
  expect(routes.primary).toHaveLength(3);
  expect(routes.readers).toHaveLength(3);
  for (const store of storesForSupervisors) {
    const coordinator = createQuorumAssignmentCoordinator({
      assignmentStore: {
        get: async () => shared.get("payments"),
        set: async (_app, writer) => {
          shared.set("payments", writer);
          return writer;
        },
      },
      observationStore: store,
      environment: { ELERA_CLUSTER_SIZE: "3" },
      now: () => 100,
    });
    await coordinator.write("payments", routes.writer.host);
  }
  expect(shared.get("payments")).toBe(routes.writer.host);
});

test("quorum loss stops assignment changes and conflicting cluster views are rejected", async () => {
  const observations = [
    observation("elera-0.cluster.local"),
    observation("elera-1.cluster.local"),
    observation("elera-2.cluster.local"),
  ];
  expect(evaluateQuorum(observations, { expectedSize: 3, now: 100 }).quorum).toBe(true);
  const store = createObservationStore({ now: () => 100 });
  observations.slice(0, 1).forEach((item) => store.upsert(item));
  const set = jest.fn();
  const coordinator = createQuorumAssignmentCoordinator({
    assignmentStore: { get: async () => "elera-0.cluster.local.elera", set },
    observationStore: store,
    environment: { ELERA_CLUSTER_SIZE: "3" },
    now: () => 100,
  });
  await expect(coordinator.write("payments", "elera-0.cluster.local.elera")).rejects.toMatchObject({
    code: "QUORUM_REQUIRED",
  });
  expect(set).not.toHaveBeenCalled();
  expect(
    evaluateQuorum(
      observations.map((item, index) => (index === 2 ? { ...item, clusterId: "foreign" } : item)),
      { expectedSize: 3, now: 100 },
    ).reason,
  ).toBe("conflicting-clusters");
});
