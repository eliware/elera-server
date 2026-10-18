import { expect, test } from "@jest/globals";
import { createRemoteRecoveryEvidence } from "../../../src/cluster/cold-bootstrap/remote-recovery-evidence.mjs";

test("rejects missing, malformed, and non-FQDN peer URLs", async () => {
  const remote = createRemoteRecoveryEvidence();
  await expect(remote()).rejects.toMatchObject({ code: "RECOVERY_EVIDENCE_UNAVAILABLE" });
  await expect(remote("")).rejects.toMatchObject({ code: "RECOVERY_EVIDENCE_UNAVAILABLE" });
  await expect(remote("not a URL")).rejects.toMatchObject({
    code: "RECOVERY_EVIDENCE_UNAVAILABLE",
  });
  await expect(remote("not a URL", "peer.example.test")).rejects.toMatchObject({
    code: "RECOVERY_EVIDENCE_UNAVAILABLE",
  });
  await expect(remote("http://localhost")).rejects.toMatchObject({
    code: "RECOVERY_EVIDENCE_UNAVAILABLE",
  });
  await expect(remote("http://localhost", "peer.example.test")).rejects.toMatchObject({
    code: "RECOVERY_EVIDENCE_UNAVAILABLE",
  });
});

test("reports peer transport and JSON failures", async () => {
  const offline = createRemoteRecoveryEvidence({
    fetchImpl: async () => {
      throw new Error("offline");
    },
  });
  await expect(offline("http://peer.example.test")).rejects.toMatchObject({
    code: "RECOVERY_EVIDENCE_UNAVAILABLE",
  });
  const invalidJson = createRemoteRecoveryEvidence({
    fetchImpl: async () => ({
      ok: true,
      json: async () => {
        throw new Error("bad JSON");
      },
    }),
  });
  await expect(invalidJson("http://peer.example.test", "peer.example.test")).rejects.toMatchObject({
    code: "INVALID_RECOVERY_EVIDENCE",
  });
  await expect(invalidJson("http://peer.example.test")).rejects.toMatchObject({
    code: "INVALID_RECOVERY_EVIDENCE",
  });
});

test("rejects malformed evidence payloads", async () => {
  for (const data of [undefined, {}, { node: 4 }]) {
    const remote = createRemoteRecoveryEvidence({
      fetchImpl: async () => ({ ok: true, json: async () => ({ data }) }),
    });
    await expect(remote("http://peer.example.test")).rejects.toMatchObject({
      code: "INVALID_RECOVERY_EVIDENCE",
    });
  }
});

test("forwards authenticated remote evidence and validates dependencies", async () => {
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
  const evidence = createRemoteRecoveryEvidence({
    localNode: { name: "one.example.test" },
    dataDir: "/tmp",
    health: {},
    fetchImpl,
    token: "token",
  });
  await expect(evidence("http://peer.example.test/")).resolves.toEqual({
    node: "peer.example.test",
  });
  await expect(evidence("http://peer.example.test")).resolves.toEqual({
    node: "peer.example.test",
  });
});

test("rejects authenticated evidence attributed to another node", async () => {
  const evidence = createRemoteRecoveryEvidence({
    localNode: { name: "one.example.test" },
    dataDir: "/tmp",
    health: {},
    token: "token",
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return { data: { node: "other.example.test" } };
      },
    }),
  });
  await expect(evidence("http://peer.example.test", "peer")).rejects.toMatchObject({
    code: "RECOVERY_EVIDENCE_IDENTITY_MISMATCH",
  });
});

test("rejects malformed remote evidence at the protocol boundary", async () => {
  const evidence = createRemoteRecoveryEvidence({
    localNode: { name: "one.example.test" },
    dataDir: "/tmp",
    health: {},
    token: "token",
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return { data: null };
      },
    }),
  });
  await expect(evidence("http://peer.example.test")).rejects.toMatchObject({
    code: "INVALID_RECOVERY_EVIDENCE",
  });
});
