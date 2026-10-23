import { afterEach, expect, jest, test } from "@jest/globals";
import { createManagedCredentialLeases } from "../../../src/metadata/managed/credential-leases.mjs";

const runtimeIdentity = "node.example.test";
const identityRow = {
  application: "billing",
  database: "billing",
  physical_database: "billing_123",
  username: "billing_runtime",
  credential_ciphertext: "encrypted",
};
const createLease = (overrides = {}) => {
  const q = jest.fn(async () => [[identityRow]]);
  const box = { open: jest.fn(() => "password") };
  return {
    leases: createManagedCredentialLeases({
      q,
      box,
      identity: { name: runtimeIdentity },
      ...overrides,
    }),
    q,
    box,
  };
};

afterEach(() => jest.useRealTimers());

test("creates a default lease with runtime routes", async () => {
  jest.useFakeTimers().setSystemTime(new Date("2026-10-14T00:00:00Z"));
  const { leases, box } = createLease();
  await expect(leases.lease({ identity: "runtime" })).resolves.toMatchObject({
    application: "billing",
    database: "billing",
    physicalDatabase: "billing_123",
    identity: "runtime",
    username: "billing_runtime",
    password: "password",
    routes: {
      primary: [{ host: runtimeIdentity, port: 3306, nodeId: runtimeIdentity }],
      balanced: [{ host: runtimeIdentity, port: 3306, nodeId: runtimeIdentity }],
    },
    nodeIdentity: runtimeIdentity,
    expiresAt: "2026-10-14T01:00:00.000Z",
  });
  expect(box.open).toHaveBeenCalledWith("encrypted");
});

test("accepts explicit routes and a matching node identity", async () => {
  const { leases } = createLease();
  const routes = {
    primary: [{ host: "primary.example.test", nodeId: "primary.example.test", port: 3306 }],
    balanced: [{ host: "replica.example.test", nodeId: "replica.example.test", port: 3307 }],
  };
  await expect(
    leases.lease({ identity: "runtime", nodeIdentity: runtimeIdentity, routes, ports: [3306] }),
  ).resolves.toMatchObject({ routes, ports: [3306] });
});

test("leases the persistent token account instead of stored identity credentials", async () => {
  const tokenAccounts = { usernameFor: (tokenId) => `elera_t_${tokenId}` };
  const { leases, box } = createLease({ tokenAccounts });
  await expect(
    leases.lease({ identity: "runtime", tokenId: "42", sqlToken: "runtime-token" }),
  ).resolves.toMatchObject({ username: "elera_t_42", password: "runtime-token" });
  expect(box.open).not.toHaveBeenCalled();
});

test("rejects invalid identities, missing encryption, and absent credentials", async () => {
  const { leases } = createLease();
  await expect(leases.lease({ identity: "" })).rejects.toThrow("identity is invalid");
  await expect(
    createManagedCredentialLeases({
      q: jest.fn(),
      box: null,
      identity: { name: runtimeIdentity },
    }).lease({ identity: "runtime" }),
  ).rejects.toThrow("credential encryption is not configured");
  await expect(
    leases.lease({ identity: "runtime", nodeIdentity: "other.example.test" }),
  ).rejects.toMatchObject({ statusCode: 409 });
  const missing = createLease({ q: async () => [[]] });
  await expect(missing.leases.lease({ identity: "runtime" })).rejects.toMatchObject({
    statusCode: 404,
  });
});

test("validates every route host and node identity", async () => {
  const { leases } = createLease();
  await expect(
    leases.lease({
      identity: "runtime",
      routes: { primary: [{ host: "short", nodeId: runtimeIdentity }] },
    }),
  ).rejects.toThrow("lease route host must be a valid hostname");
  await expect(
    leases.lease({
      identity: "runtime",
      routes: { balanced: [{ host: runtimeIdentity, nodeId: "short" }] },
    }),
  ).rejects.toThrow("lease route node must be a valid hostname");
});
