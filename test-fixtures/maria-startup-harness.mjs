import { jest } from "@jest/globals";

export const createMariaStartupHarness = () => ({
  config: { elera: true, clusterSize: 1, startupTimeoutMs: 10, shutdownTimeoutMs: 10 },
  startupDecision: { mode: "join", reason: "join", epoch: 1 },
  health: {
    status: jest.fn(async () => ({
      values: {
        wsrep_local_state_comment: "Synced",
        wsrep_ready: "ON",
        wsrep_cluster_status: "Primary",
        wsrep_cluster_size: "1",
      },
    })),
  },
  processController: { start: jest.fn(() => Promise.resolve()), stop: jest.fn() },
  recoveryState: { set: jest.fn() },
  recoveryAudit: { joinStart: jest.fn(), failure: jest.fn() },
  recoveryCompletion: {},
  identity: { name: "node-a.example.test" },
  log: { warn: jest.fn(), error: jest.fn() },
  signals: { shutdown: jest.fn() },
});
