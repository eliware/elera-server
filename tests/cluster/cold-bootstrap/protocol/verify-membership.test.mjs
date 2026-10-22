import { expect, jest, test } from "@jest/globals";
import { verifyRecoveryMembership } from "../../../../src/cluster/cold-bootstrap/protocol/verify-membership.mjs";

const nodes = [{ name: "a.example.test" }, { name: "b.example.test" }];
const live = (node) => ({
  node,
  active: true,
  galera: {
    clusterUuid: "cluster",
    clusterStatus: "Primary",
    localState: "Synced",
    ready: "ON",
    clusterSize: 2,
  },
});

test("returns members only after every Galera peer reports the approved Primary", async () => {
  await expect(
    verifyRecoveryMembership({
      collect: async () => ({ evidence: nodes.map(({ name }) => live(name)) }),
      nodes,
      clusterId: "cluster",
    }),
  ).resolves.toEqual(["a.example.test", "b.example.test"]);
});

test("rejects missing, inactive, stale, or undersized Galera membership", async () => {
  const invalid = [
    [live(nodes[0].name)],
    [live(nodes[0].name), { ...live(nodes[1].name), active: false }],
    [
      live(nodes[0].name),
      { ...live(nodes[1].name), galera: { ...live(nodes[1].name).galera, clusterUuid: "old" } },
    ],
    [
      live(nodes[0].name),
      { ...live(nodes[1].name), galera: { ...live(nodes[1].name).galera, clusterSize: 1 } },
    ],
    [
      live(nodes[0].name),
      { ...live(nodes[1].name), galera: { ...live(nodes[1].name).galera, ready: "OFF" } },
    ],
  ];
  for (const evidence of invalid)
    await expect(
      verifyRecoveryMembership({
        collect: async () => ({ evidence }),
        nodes,
        clusterId: "cluster",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  await expect(
    verifyRecoveryMembership({
      collect: jest.fn().mockRejectedValue(new Error("offline")),
      nodes,
      clusterId: "cluster",
    }),
  ).rejects.toThrow("offline");
});
