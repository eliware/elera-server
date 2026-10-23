import { expect, jest, test } from "@jest/globals";
import { acquireRecoveryLeases } from "../../../src/runtime/recovery/leases.mjs";
import { authorizeSupervisorRecovery } from "../../../src/runtime/recovery/authorization.mjs";

const config = { httpPort: 8080, timeoutMs: 100 };
const decision = { epoch: "epoch-1", winner: "a.example.test" };
const nodes = [{ name: decision.winner }, { name: "b.example.test" }];
const base = (fetchImpl) => ({
  decision: { mode: "bootstrap", localWinner: true, winner: "a", epoch: 3, reason: "winner" },
  members: [
    { name: "a", local: true, url: "http://a" },
    { name: "b", url: "http://b" },
    { name: "c", url: "http://c" },
  ],
  config: { httpPort: 8080, timeoutMs: 10, dataDir: "/data" },
  intentState: { paths: { renderedPath: "/state.cnf" } },
  recoveryProtocol: { authorize: jest.fn(), beginBootstrap: jest.fn() },
  recoveryState: { set: jest.fn() },
  recoveryAudit: { lease: jest.fn(), authorization: jest.fn(), bootstrapStart: jest.fn() },
  log: { warn: jest.fn() },
  environment: { ROOT_TOKEN: "root" },
  fetchImpl,
  promote: jest.fn(),
  argumentsFor: jest.fn(() => ["--x"]),
  applyArguments: jest.fn((args) => [...args, "--bootstrap"]),
});

test("records granted and denied recovery lease claims", async () => {
  const recoveryAudit = { lease: jest.fn() };
  const fetchImpl = jest
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { granted: true, epoch: decision.epoch, winner: decision.winner },
      }),
    })
    .mockRejectedValueOnce(new Error("offline"));
  await expect(
    acquireRecoveryLeases({
      decision,
      members: nodes,
      config,
      environment: { ROOT_TOKEN: "root" },
      fetchImpl,
      recoveryAudit,
    }),
  ).resolves.toEqual([
    {
      member: "a.example.test",
      epoch: decision.epoch,
      winner: decision.winner,
      granted: true,
      authenticated: true,
    },
    {
      member: "b.example.test",
      epoch: undefined,
      winner: undefined,
      granted: false,
      authenticated: false,
    },
  ]);
  expect(recoveryAudit.lease).toHaveBeenCalledTimes(2);
});

test("claims the local recovery lease without using the startup listener", async () => {
  const localLease = {
    claim: jest.fn(async ({ epoch, winner }) => ({ granted: true, epoch, winner })),
  };
  const fetchImpl = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      data: { granted: true, epoch: decision.epoch, winner: decision.winner },
    }),
  });
  const claims = await acquireRecoveryLeases({
    decision,
    members: [
      { name: decision.winner, local: true, url: `http://${decision.winner}` },
      { name: "b.example.test", url: "http://b.example.test" },
    ],
    config,
    environment: { ROOT_TOKEN: "root" },
    fetchImpl,
    recoveryAudit: { lease: jest.fn() },
    localLease,
  });
  expect(claims.every((claim) => claim.granted && claim.authenticated)).toBe(true);
  expect(localLease.claim).toHaveBeenCalledWith(decision);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test("rejects stale or mismatched peer lease grants", async () => {
  const fetchImpl = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ data: { granted: true, epoch: "old", winner: decision.winner } }),
  });
  const claims = await acquireRecoveryLeases({
    decision,
    members: [nodes[0]],
    config,
    environment: { ROOT_TOKEN: "root" },
    fetchImpl,
    recoveryAudit: { lease: jest.fn() },
  });
  expect(claims[0]).toMatchObject({ granted: false, authenticated: false });
});

test("rejects lease URLs for a different member host", async () => {
  await expect(
    acquireRecoveryLeases({
      decision,
      members: [{ name: "a.example.test", url: "http://other.example.test" }],
      config,
      environment: {},
      fetchImpl: jest.fn(),
      recoveryAudit: { lease: jest.fn() },
    }),
  ).rejects.toThrow("does not match");
});

test("does nothing for non-winner decisions", async () => {
  const value = base(jest.fn());
  value.decision = { mode: "join", localWinner: false };
  await expect(authorizeSupervisorRecovery(value)).resolves.toEqual({
    decision: value.decision,
    args: undefined,
  });
  expect(value.fetchImpl).not.toHaveBeenCalled();
});
