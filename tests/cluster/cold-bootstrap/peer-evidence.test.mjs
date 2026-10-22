import { expect, test } from "@jest/globals";
import { createColdBootstrapEvidence } from "../../../src/cluster/cold-bootstrap/peer-evidence.mjs";

const createEvidence = (fetchImpl) =>
  createColdBootstrapEvidence({
    localNode: { name: "one.example.test" },
    dataDir: "/tmp",
    health: {},
    fetchImpl,
    token: "token",
  });

test("forwards authenticated remote evidence and validates facade dependencies", async () => {
  const fetchImpl = async (url, options) => {
    expect(url).toBe("http://peer.example.test/api/v1/cluster/cold-bootstrap/evidence");
    expect(options.headers.authorization).toBe("Bearer token");
    return {
      ok: true,
      async json() {
        return { data: { node: "peer.example.test" } };
      },
    };
  };
  const evidence = createEvidence(fetchImpl);
  await expect(evidence.remote("http://peer.example.test/")).resolves.toEqual({
    node: "peer.example.test",
  });
  await expect(evidence.remote("http://peer.example.test")).resolves.toEqual({
    node: "peer.example.test",
  });
  expect(evidence).toEqual({ local: expect.any(Function), remote: expect.any(Function) });
  expect(() => createColdBootstrapEvidence()).toThrow("cold bootstrap local data");
});

test("rejects remote identity mismatches and malformed evidence", async () => {
  const mismatch = createEvidence(async () => ({
    ok: true,
    async json() {
      return { data: { node: "other.example.test" } };
    },
  }));
  await expect(mismatch.remote("http://peer.example.test", "peer")).rejects.toMatchObject({
    code: "RECOVERY_EVIDENCE_IDENTITY_MISMATCH",
  });

  const malformed = createEvidence(async () => ({
    ok: true,
    async json() {
      return { data: null };
    },
  }));
  await expect(malformed.remote("http://peer.example.test")).rejects.toMatchObject({
    code: "INVALID_RECOVERY_EVIDENCE",
  });
});

test("reports failed remote responses", async () => {
  const evidence = createEvidence(async () => ({ ok: false, status: 503 }));
  await expect(evidence.remote("http://peer.example.test")).rejects.toThrow("Status=503");
});
