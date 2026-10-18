import { createColdRecoveryProtocol } from "../../../src/cluster/cold-bootstrap/protocol.mjs";

export const protocolEvidence = (node, seqno) => ({
  node,
  state: { uuid: "cluster", seqno, safeToBootstrap: false },
  active: false,
  generation: 1,
  observedAt: new Date().toISOString(),
});

export const makeProtocolFixture = () => {
  const store = {
    value: undefined,
    read: async function () {
      return this.value;
    },
    write: async function (value) {
      this.value = value;
      return value;
    },
  };
  const protocol = createColdRecoveryProtocol({
    nodes: [
      { name: "a.example.test", url: "http://a.example.test", local: true },
      { name: "b.example.test", url: "http://b.example.test" },
      { name: "c.example.test", url: "http://c.example.test" },
    ],
    localEvidence: async () => protocolEvidence("a.example.test", 3),
    fetchEvidence: async (url) =>
      protocolEvidence(url.includes("b.example.test") ? "b.example.test" : "c.example.test", 2),
    store,
  });
  return { protocol, store };
};
