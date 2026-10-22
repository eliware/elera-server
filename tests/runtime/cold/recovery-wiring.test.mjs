import { expect, jest, test } from "@jest/globals";
import { createSupervisorColdRecovery } from "../../../src/runtime/cold/recovery-wiring.mjs";

const validOptions = (overrides = {}) => ({
  identity: { name: "node-a.example.test" },
  config: {
    dataDir: "/data",
    httpPort: 8080,
    intent: {
      cluster: { members: [{ name: "node-a.example.test", address: "node-a.example.test" }] },
    },
  },
  health: {},
  runRecover: jest.fn(),
  recoveryAudit: { event: jest.fn() },
  environment: {},
  createEvidence: () => ({ local: {}, remote: jest.fn() }),
  createProtocol: (options) => options,
  createStore: (path) => ({ path }),
  ...overrides,
});

test("validates runtime identity, dependencies, members, and member URLs", () => {
  expect(() => createSupervisorColdRecovery()).toThrow("valid hostname");
  expect(() => createSupervisorColdRecovery(validOptions({ identity: { name: "bad" } }))).toThrow(
    "valid hostname",
  );
  expect(() => createSupervisorColdRecovery(validOptions({ health: undefined }))).toThrow(
    "dependencies are required",
  );
  expect(() => createSupervisorColdRecovery(validOptions({ runRecover: null }))).toThrow(
    "dependencies are required",
  );
  expect(() => createSupervisorColdRecovery(validOptions({ recoveryAudit: {} }))).toThrow(
    "dependencies are required",
  );
  expect(() =>
    createSupervisorColdRecovery(validOptions({ config: { intent: { cluster: {} } } })),
  ).toThrow("configured cold recovery members");
  expect(() =>
    createSupervisorColdRecovery(
      validOptions({
        config: {
          intent: { cluster: { members: [{ name: "bad", address: "node.example.test" }] } },
        },
      }),
    ),
  ).toThrow("configured cold recovery members");
  expect(() =>
    createSupervisorColdRecovery(
      validOptions({
        config: {
          intent: { cluster: { members: [{ name: "node.example.test", address: "bad" }] } },
        },
      }),
    ),
  ).toThrow("configured cold recovery members");
  expect(() =>
    createSupervisorColdRecovery(
      validOptions({
        config: {
          httpPort: 8080,
          intent: {
            cluster: {
              members: [
                {
                  name: "node-a.example.test",
                  address: "node-a.example.test",
                  url: "http://other.example.test",
                },
              ],
            },
          },
        },
      }),
    ),
  ).toThrow("does not match");
  expect(() =>
    createSupervisorColdRecovery(
      validOptions({
        config: {
          httpPort: 8080,
          intent: {
            cluster: { members: [{ name: "node-b.example.test", address: "node-b.example.test" }] },
          },
        },
      }),
    ),
  ).toThrow("exactly one");
});

test("uses the default recovery decision path", () => {
  const result = createSupervisorColdRecovery(validOptions());
  expect(result.protocol.store.path).toBe("/run/elera/cold-recovery.json");
});

test("wires local and peer evidence into the recovery protocol", async () => {
  const evidence = { local: { state: "local" }, remote: jest.fn() };
  const store = { write: jest.fn() };
  const protocol = { plan: jest.fn() };
  let evidenceOptions;
  let protocolOptions;
  const result = createSupervisorColdRecovery({
    identity: { name: "node-a.example.test" },
    config: {
      dataDir: "/data",
      httpPort: 8080,
      intent: {
        cluster: {
          members: [
            { name: "node-a.example.test", address: "node-a.example.test" },
            { name: "node-b.example.test", address: "node-b.example.test" },
          ],
        },
      },
    },
    health: {},
    runRecover: jest.fn(),
    recoveryAudit: { event: jest.fn() },
    environment: { ROOT_TOKEN: "root", ELERA_RECOVERY_DECISION_PATH: "/tmp/decision" },
    createEvidence: (options) => {
      evidenceOptions = options;
      return evidence;
    },
    createProtocol: (options) => {
      protocolOptions = options;
      return protocol;
    },
    createStore: (path) => {
      expect(path).toBe("/tmp/decision");
      return store;
    },
  });
  expect(result).toEqual({
    evidence,
    members: [
      {
        name: "node-a.example.test",
        address: "node-a.example.test",
        local: true,
        url: "http://node-a.example.test:8080",
      },
      {
        name: "node-b.example.test",
        address: "node-b.example.test",
        local: false,
        url: "http://node-b.example.test:8080",
      },
    ],
    protocol,
  });
  expect(evidenceOptions.token).toBe("root");
  expect(protocolOptions.nodes).toHaveLength(2);
  await protocolOptions.publishEvent({ type: "recovery.test" });
  expect(protocolOptions.store).toBe(store);
});

test("supports a missing member list and default decision path", () => {
  expect(() =>
    createSupervisorColdRecovery({
      identity: { name: "node-a.example.test" },
      config: { dataDir: "/data", httpPort: 8080 },
      health: {},
      runRecover: jest.fn(),
      recoveryAudit: { event: jest.fn() },
    }),
  ).toThrow("configured cold recovery members");
});
