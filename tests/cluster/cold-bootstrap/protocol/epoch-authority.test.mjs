import { jest, expect, test } from "@jest/globals";
import { createRecoveryEpochAuthority } from "../../../../src/cluster/cold-bootstrap/protocol/epoch-authority.mjs";

jest.useFakeTimers();
test("reports pending status when no epoch exists", async () => {
  const authority = createRecoveryEpochAuthority({ read: async () => undefined });
  await expect(authority.status()).resolves.toEqual({ phase: "pending" });
});

import { createColdRecoveryProtocol } from "../../../../src/cluster/cold-bootstrap/protocol.mjs";

const recoveryEvidence = (node, seqno) => ({
  node,
  state: { uuid: "cluster", seqno, safeToBootstrap: false },
  active: false,
  generation: 1,
  observedAt: new Date().toISOString(),
});

test("returns pending status when no recovery epoch is persisted", async () => {
  const protocol = createColdRecoveryProtocol({
    nodes: [{ name: "a", local: true }],
    localEvidence: async () => recoveryEvidence("a", 1),
    fetchEvidence: async () => undefined,
    store: {
      async read() {
        return undefined;
      },
      async write(value) {
        return value;
      },
    },
  });
  await expect(protocol.status()).resolves.toEqual({ phase: "pending" });
});
