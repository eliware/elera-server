import { mkdtemp as __fixture4_mkdtemp, rm as __fixture4_rm } from "node:fs/promises";
import { jest as __fixture4_jest } from "@jest/globals";
import { join as __fixture4_join } from "node:path";
import { tmpdir as __fixture4_tmpdir } from "node:os";
import { createStartupRecoveryDecision as __fixture4_createStartupRecoveryDecision } from "../../src/cluster/cold-bootstrap/startup/decision.mjs";
import { createRecoveryLease as __fixture4_createRecoveryLease } from "../../src/cluster/cold-bootstrap/lease.mjs";
import { createSupervisorRecoveryJoiner as __fixture4_createSupervisorRecoveryJoiner } from "../../src/runtime/recovery/join/wiring.mjs";
import { expect, jest, test } from "@jest/globals";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const listen = jest.fn(async () => {});
const close = jest.fn(async () => {});
const set = jest.fn();
const plan = jest.fn(async () => ({ mode: "bootstrap", localWinner: false }));
const retry = jest.fn(async () => ({ mode: "blocked", reason: "still unavailable" }));
const evidence = jest.fn(async () => [
  { node: "node-b.example.test", active: true, galera: { clusterStatus: "Primary" } },
]);
const record = jest.fn(async () => {});
const authorize = jest.fn(async ({ decision }) => ({ decision, args: ["--recovered"] }));
const rejoin = jest.fn(async ({ decision }) => decision);
const resolveExplicit = jest.fn(async () => ({ explicit: false }));

jest.unstable_mockModule("../../src/runtime/cold/recovery-wiring.mjs", () => ({
  createSupervisorColdRecovery: () => ({
    evidence: {},
    members: [
      { name: "node-a.example.test", address: "node-a.example.test" },
      { name: "node-b.example.test", address: "node-b.example.test" },
    ],
    protocol: { plan, retry, evidence },
  }),
}));
jest.unstable_mockModule("../../src/cluster/cold-bootstrap/startup/evidence/server.mjs", () => ({
  createStartupEvidenceServer: () => ({ listen, close }),
}));
jest.unstable_mockModule("../../src/runtime/recovery/evidence-service.mjs", () => ({
  startRecoveryEvidenceService: async (options) => {
    options.options.getMariaProcess?.();
    if (options.unifiedListener) options.setStartupHandler?.("routes");
    else await listen();
    return {
      completion: {},
      server: options.unifiedListener ? undefined : { listen, close },
      routes: "routes",
    };
  },
}));
jest.unstable_mockModule("../../src/runtime/startup/decision-wiring.mjs", () => ({
  resolveExplicitSupervisorStartup: resolveExplicit,
}));
jest.unstable_mockModule("../../src/runtime/recovery/startup/decision.mjs", () => ({
  recoveryStartupDecision: (decision) => decision,
}));
jest.unstable_mockModule("../../src/runtime/recovery/decision.mjs", () => ({
  recordSupervisorRecoveryDecision: record,
}));
jest.unstable_mockModule("../../src/runtime/recovery/authorization.mjs", () => ({
  authorizeSupervisorRecovery: authorize,
}));
jest.unstable_mockModule("../../src/runtime/rejoin-decision.mjs", () => ({
  resolveSupervisorRejoin: rejoin,
}));
jest.unstable_mockModule("../../src/cluster/cold-bootstrap/completion.mjs", () => ({
  createRecoveryCompletion: () => ({}),
}));
jest.unstable_mockModule("../../src/cluster/cold-bootstrap/lease.mjs", () => ({
  createRecoveryLease: () => ({}),
}));

const { prepareSupervisorRecovery } = await import("../../src/runtime/recovery/startup.mjs");

test("coordinates Elera recovery and closes evidence server after non-bootstrap decision", async () => {
  const result = await prepareSupervisorRecovery({
    startupConfiguration: {
      initialIntent: {
        cluster: { members: [{ name: "node-a.example.test", address: "node-a.example.test" }] },
      },
      args: ["--safe"],
    },
    intentState: {},
    config: { elera: true, dataDir: "data", httpPort: 8080 },
    identity: { name: "node-a.example.test", address: "node-a.example.test" },
    health: {},
    recoveryState: { set },
    recoveryAudit: { event: async () => {} },
    log: {},
    mariaProcess: { mariaProcess: { child: { exitCode: 1 } } },
  });
  expect(result.args).toEqual(["--recovered"]);
  expect(set).toHaveBeenCalledWith("collecting-evidence");
  expect(listen).toHaveBeenCalled();
  expect(close).toHaveBeenCalled();
  expect(record).toHaveBeenCalled();
});

test("mounts recovery routes on the shared listener without creating a temporary server", async () => {
  plan.mockResolvedValueOnce({ mode: "bootstrap", localWinner: false });
  const setStartupHandler = jest.fn();
  const result = await prepareSupervisorRecovery({
    startupConfiguration: {
      initialIntent: {
        cluster: { members: [{ name: "node-a.example.test", address: "node-a.example.test" }] },
      },
      args: [],
    },
    intentState: {},
    config: { elera: true, dataDir: "data", httpPort: 8080 },
    identity: { name: "node-a.example.test", address: "node-a.example.test" },
    health: {},
    recoveryState: { set: jest.fn() },
    recoveryAudit: { event: async () => {} },
    log: {},
    environment: { ROOT_TOKEN: "token" },
    mariaProcess: {},
    probes: { setStartupHandler, start: jest.fn(async () => {}) },
  });
  expect(setStartupHandler).toHaveBeenCalledWith("routes");
  expect(result.startupServer).toBeUndefined();
});

test("keeps the shared listener open for a clean-restart join", async () => {
  const setStartupHandler = jest.fn();
  const consume = jest.fn(async () => ({ node: "node-a.example.test", nonce: "shared" }));
  const result = await prepareSupervisorRecovery({
    startupConfiguration: {
      initialIntent: {
        cluster: {
          members: [
            { name: "node-a.example.test", address: "node-a.example.test" },
            { name: "node-b.example.test", address: "node-b.example.test" },
          ],
        },
      },
      args: [],
    },
    intentState: {},
    config: { elera: true, dataDir: "data", httpPort: 8080 },
    identity: { name: "node-a.example.test", address: "node-a.example.test" },
    health: {},
    recoveryState: { set: jest.fn() },
    recoveryAudit: { event: async () => {} },
    log: {},
    environment: {},
    mariaProcess: {},
    probes: { setStartupHandler, start: jest.fn(async () => {}) },
    restartMarker: { consume },
  });
  expect(result.startupDecision.mode).toBe("join");
  expect(result.startupServer).toBeUndefined();
});

test("retains the evidence server for the local bootstrap winner", async () => {
  plan.mockResolvedValueOnce({ mode: "bootstrap", localWinner: true });
  const before = close.mock.calls.length;
  const result = await prepareSupervisorRecovery({
    startupConfiguration: { initialIntent: { cluster: { members: [{}] } }, args: [] },
    intentState: {},
    config: { elera: true, dataDir: "data", httpPort: 8080 },
    identity: { name: "node-a.example.test", address: "node-a.example.test" },
    health: {},
    recoveryState: { set: jest.fn() },
    recoveryAudit: { event: async () => {} },
    log: {},
    environment: { ELERA_PEER_TOKEN: "peer" },
    mariaProcess: { child: { exitCode: null } },
  });
  expect(result.startupServer).toBeDefined();
  expect(close.mock.calls.length).toBe(before);
});

test("honors an explicit startup decision without opening coordination", async () => {
  resolveExplicit.mockResolvedValueOnce({
    explicit: true,
    decision: { mode: "standalone" },
    args: ["--explicit"],
  });
  const result = await prepareSupervisorRecovery({
    startupConfiguration: { initialIntent: { cluster: { members: [{}] } }, args: [] },
    intentState: {},
    config: { elera: true, dataDir: "data", httpPort: 8080 },
    identity: { name: "node-a.example.test", address: "node-a.example.test" },
    health: {},
    recoveryState: { set: jest.fn() },
    recoveryAudit: { event: async () => {} },
    log: {},
    environment: {},
    mariaProcess: {},
  });
  expect(result.args).toEqual(["--explicit"]);
  expect(result.startupDecision.mode).toBe("standalone");
});

test("returns the standalone decision when Elera mode is disabled", async () => {
  const result = await prepareSupervisorRecovery({
    startupConfiguration: { initialIntent: { cluster: { members: [] } }, args: ["--standalone"] },
    intentState: {},
    config: { elera: false, dataDir: "data", httpPort: 8080 },
    identity: { name: "node-a.example.test", address: "node-a.example.test" },
    health: {},
    recoveryState: { set: jest.fn() },
    recoveryAudit: { event: async () => {} },
    log: {},
    environment: {},
    mariaProcess: {},
  });
  expect(result.startupDecision).toEqual({
    mode: "standalone",
    reason: "single-node configuration",
  });
});

test("continues when authorization does not replace process arguments", async () => {
  authorize.mockResolvedValueOnce({ decision: { mode: "join" } });
  const result = await prepareSupervisorRecovery({
    startupConfiguration: { initialIntent: { cluster: { members: [{}] } }, args: ["--original"] },
    intentState: {},
    config: { elera: true, dataDir: "data", httpPort: 8080 },
    identity: { name: "node-a.example.test", address: "node-a.example.test" },
    health: {},
    recoveryState: { set: jest.fn() },
    recoveryAudit: { event: async () => {} },
    log: {},
    environment: {},
    mariaProcess: {},
  });
  expect(result.args).toEqual(["--original"]);
});

test("keeps original arguments when authorization returns no replacement", async () => {
  authorize.mockClear();
  plan.mockResolvedValueOnce({ mode: "bootstrap", localWinner: false });
  authorize.mockResolvedValueOnce({ decision: { mode: "bootstrap", localWinner: false } });
  const result = await prepareSupervisorRecovery({
    startupConfiguration: {
      initialIntent: {
        cluster: { members: [{ name: "node-a.example.test", address: "node-a.example.test" }] },
      },
      args: ["--original"],
    },
    intentState: {},
    config: { elera: true, dataDir: "data", httpPort: 8080 },
    identity: { name: "node-a.example.test", address: "node-a.example.test" },
    health: {},
    recoveryState: { set: jest.fn() },
    recoveryAudit: { event: async () => {} },
    log: {},
    environment: {},
    mariaProcess: {},
  });
  expect(result.args).toEqual(["--original"]);
});

test("uses a valid clean marker and active Primary peer for ordinary join", async () => {
  plan.mockClear();
  const consume = jest.fn(async () => ({ node: "node-a.example.test", epoch: null, nonce: "n" }));
  const result = await prepareSupervisorRecovery({
    startupConfiguration: {
      initialIntent: {
        cluster: {
          members: [
            { name: "node-a.example.test", address: "node-a.example.test" },
            { name: "node-b.example.test", address: "node-b.example.test" },
          ],
        },
      },
      args: [],
    },
    intentState: {},
    config: { elera: true, dataDir: "data", httpPort: 8080 },
    identity: { name: "node-a.example.test", address: "node-a.example.test" },
    health: {},
    recoveryState: { set: jest.fn() },
    recoveryAudit: { event: async () => {} },
    log: {},
    environment: {},
    mariaProcess: {},
    restartMarker: { consume },
  });
  expect(result.startupDecision).toMatchObject({ mode: "join", bootstrapComplete: true });
  expect(consume).toHaveBeenCalled();
  expect(plan).not.toHaveBeenCalled();
});

test("reads and consumes a clean-restart marker through the reader path", async () => {
  const read = jest.fn(async () => ({
    node: "node-a.example.test",
    epoch: 3,
    nonce: "reader-nonce",
  }));
  const consume = jest.fn(async () => {});
  const result = await prepareSupervisorRecovery({
    startupConfiguration: {
      initialIntent: {
        cluster: {
          members: [
            { name: "node-a.example.test", address: "node-a.example.test" },
            { name: "node-b.example.test", address: "node-b.example.test" },
          ],
        },
      },
      args: [],
    },
    intentState: {},
    config: { elera: true, dataDir: "data", httpPort: 8080, startupTimeoutMs: 1000 },
    identity: { name: "node-a.example.test", address: "node-a.example.test" },
    health: {},
    recoveryState: { set: jest.fn() },
    recoveryAudit: { event: async () => {} },
    log: {},
    environment: {},
    mariaProcess: {},
    restartMarker: { read, consume },
  });
  expect(result.startupDecision.mode).toBe("join");
  expect(read).toHaveBeenCalled();
  expect(consume).toHaveBeenCalledWith({ expectedNonce: "reader-nonce" });
});

test("falls through to evidence coordination when no clean-restart marker exists", async () => {
  const read = jest.fn(async () => null);
  const result = await prepareSupervisorRecovery({
    startupConfiguration: {
      initialIntent: {
        cluster: { members: [{ name: "node-a.example.test", address: "node-a.example.test" }] },
      },
      args: [],
    },
    intentState: {},
    config: { elera: true, dataDir: "data", httpPort: 8080 },
    identity: { name: "node-a.example.test", address: "node-a.example.test" },
    health: {},
    recoveryState: { set: jest.fn() },
    recoveryAudit: { event: async () => {} },
    log: {},
    environment: {},
    mariaProcess: {},
    restartMarker: { read },
  });
  expect(result.startupDecision.mode).toBe("bootstrap");
  expect(read).toHaveBeenCalled();
});

test("falls through safely when clean-restart peer evidence is unavailable", async () => {
  evidence.mockRejectedValueOnce(new Error("peer evidence unavailable"));
  const read = jest.fn(async () => ({
    node: "node-a.example.test",
    epoch: null,
    nonce: "n-evidence",
  }));
  const consume = jest.fn(async () => {});
  const result = await prepareSupervisorRecovery({
    startupConfiguration: {
      initialIntent: {
        cluster: {
          members: [
            { name: "node-a.example.test", address: "node-a.example.test" },
            { name: "node-b.example.test", address: "node-b.example.test" },
          ],
        },
      },
      args: [],
    },
    intentState: {},
    config: { elera: true, dataDir: "data", httpPort: 8080, startupTimeoutMs: 1000 },
    identity: { name: "node-a.example.test", address: "node-a.example.test" },
    health: {},
    recoveryState: { set: jest.fn() },
    recoveryAudit: { event: async () => {} },
    log: {},
    environment: {},
    mariaProcess: {},
    restartMarker: { read, consume },
  });
  expect(result.startupDecision.mode).toBe("bootstrap");
  expect(consume).not.toHaveBeenCalled();
});

test("closes the evidence server when recovery remains blocked after planning", async () => {
  plan.mockResolvedValueOnce({ mode: "blocked", reason: "evidence unavailable" });
  const before = close.mock.calls.length;
  const result = await prepareSupervisorRecovery({
    startupConfiguration: {
      initialIntent: {
        cluster: {
          members: [
            { name: "node-a.example.test", address: "node-a.example.test" },
            { name: "node-b.example.test", address: "node-b.example.test" },
          ],
        },
      },
      args: [],
    },
    intentState: {},
    config: { elera: true, dataDir: "data", httpPort: 8080, startupTimeoutMs: 1 },
    identity: { name: "node-a.example.test", address: "node-a.example.test" },
    health: {},
    recoveryState: { set: jest.fn() },
    recoveryAudit: { event: async () => {} },
    log: {},
    environment: {},
    mariaProcess: {},
  });
  expect(result.startupDecision.mode).toBe("blocked");
  expect(close.mock.calls.length).toBeGreaterThan(before);
  expect(retry).not.toHaveBeenCalled();
});

test("classifies initialized blocked recovery as normal rejoin", async () => {
  const directory = await mkdtemp(join(tmpdir(), "elera-rejoin-"));
  await mkdir(join(directory, "mysql"));
  try {
    plan.mockResolvedValueOnce({ mode: "blocked", reason: "peer evidence unavailable" });
    const result = await prepareSupervisorRecovery({
      startupConfiguration: {
        initialIntent: {
          cluster: {
            members: [
              { name: "node-a.example.test", address: "node-a.example.test" },
              { name: "node-b.example.test", address: "node-b.example.test" },
            ],
          },
        },
        args: [],
      },
      intentState: {},
      config: { elera: true, dataDir: directory, httpPort: 8080, startupTimeoutMs: 1 },
      identity: { name: "node-a.example.test", address: "node-a.example.test" },
      health: {},
      recoveryState: { set: jest.fn() },
      recoveryAudit: { event: async () => {} },
      log: {},
      environment: {},
      mariaProcess: {},
    });
    expect(result.startupDecision).toMatchObject({ mode: "rejoin", bootstrapComplete: true });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("retries a blocked recovery plan before proceeding with a later plan", async () => {
  jest.useFakeTimers();
  plan
    .mockResolvedValueOnce({ mode: "blocked", reason: "peer evidence pending" })
    .mockResolvedValueOnce({ mode: "bootstrap", localWinner: false, reason: "winner selected" });
  const pending = prepareSupervisorRecovery({
    startupConfiguration: {
      initialIntent: {
        cluster: {
          members: [
            { name: "node-a.example.test", address: "node-a.example.test" },
            { name: "node-b.example.test", address: "node-b.example.test" },
          ],
        },
      },
      args: [],
    },
    intentState: {},
    config: { elera: true, dataDir: "data", httpPort: 8080, startupTimeoutMs: 2000 },
    identity: { name: "node-a.example.test", address: "node-a.example.test" },
    health: {},
    recoveryState: { set: jest.fn() },
    recoveryAudit: { event: async () => {} },
    log: {},
    environment: {},
    mariaProcess: {},
  });
  await Promise.resolve();
  await jest.advanceTimersByTimeAsync(1000);
  await pending;
  expect(retry).toHaveBeenCalled();
  jest.useRealTimers();
});

test("waits for a clean-restart peer before retrying recovery coordination", async () => {
  jest.useFakeTimers();
  evidence.mockResolvedValueOnce([]);
  plan
    .mockResolvedValueOnce({ mode: "blocked", reason: "peer not ready" })
    .mockResolvedValueOnce({ mode: "join", reason: "peer ready" });
  const pending = prepareSupervisorRecovery({
    startupConfiguration: {
      initialIntent: {
        cluster: {
          members: [
            { name: "node-a.example.test", address: "node-a.example.test" },
            { name: "node-b.example.test", address: "node-b.example.test" },
          ],
        },
      },
      args: [],
    },
    intentState: {},
    config: { elera: true, dataDir: "data", httpPort: 8080, startupTimeoutMs: 2000 },
    identity: { name: "node-a.example.test", address: "node-a.example.test" },
    health: {},
    recoveryState: { set: jest.fn() },
    recoveryAudit: { event: async () => {} },
    log: {},
    environment: {},
    mariaProcess: {},
    restartMarker: { consume: jest.fn(async () => ({ nonce: "retry-nonce" })) },
  });
  await jest.advanceTimersByTimeAsync(1000);
  await pending;
  expect(retry).toHaveBeenCalled();
  jest.useRealTimers();
});

test("retries clean-restart peer evidence until the timeout budget is exhausted", async () => {
  jest.useFakeTimers();
  evidence.mockResolvedValue([]);
  const read = jest.fn(async () => ({ node: "node-a.example.test", nonce: "retry-marker" }));
  const pending = prepareSupervisorRecovery({
    startupConfiguration: {
      initialIntent: {
        cluster: {
          members: [
            { name: "node-a.example.test", address: "node-a.example.test" },
            { name: "node-b.example.test", address: "node-b.example.test" },
          ],
        },
      },
      args: [],
    },
    intentState: {},
    config: { elera: true, dataDir: "data", httpPort: 8080, startupTimeoutMs: 3000 },
    identity: { name: "node-a.example.test", address: "node-a.example.test" },
    health: {},
    recoveryState: { set: jest.fn() },
    recoveryAudit: { event: async () => {} },
    log: {},
    environment: {},
    mariaProcess: {},
    restartMarker: { read, consume: jest.fn() },
  });
  await Promise.resolve();
  await jest.advanceTimersByTimeAsync(2000);
  await pending;
  expect(evidence).toHaveBeenCalled();
  expect(read).toHaveBeenCalled();
  jest.useRealTimers();
});

test("uses the bounded default clean-restart attempt count", async () => {
  jest.useFakeTimers();
  const read = jest.fn(async () => ({ node: "node-a.example.test", nonce: "default-budget" }));
  const pending = prepareSupervisorRecovery({
    startupConfiguration: {
      initialIntent: {
        cluster: { members: [{ name: "node-a.example.test", address: "node-a.example.test" }] },
      },
      args: [],
    },
    intentState: {},
    config: { elera: true, dataDir: "data", httpPort: 8080 },
    identity: { name: "node-a.example.test", address: "node-a.example.test" },
    health: {},
    recoveryState: { set: jest.fn() },
    recoveryAudit: { event: async () => {} },
    log: {},
    environment: {},
    mariaProcess: {},
    restartMarker: { read },
  });
  await jest.advanceTimersByTimeAsync(14000);
  const result = await pending;
  expect(result.startupDecision).toBeDefined();
  expect(read).toHaveBeenCalled();
  jest.useRealTimers();
});

test("caps excessive clean-restart retry budgets", async () => {
  jest.useFakeTimers();
  const read = jest.fn(async () => ({ node: "node-a.example.test", nonce: "bounded" }));
  const pending = prepareSupervisorRecovery({
    startupConfiguration: {
      initialIntent: {
        cluster: {
          members: [
            { name: "node-a.example.test", address: "node-a.example.test" },
            { name: "node-b.example.test", address: "node-b.example.test" },
          ],
        },
      },
      args: [],
    },
    intentState: {},
    config: { elera: true, dataDir: "data", httpPort: 8080, startupTimeoutMs: 30000 },
    identity: { name: "node-a.example.test", address: "node-a.example.test" },
    health: {},
    recoveryState: { set: jest.fn() },
    recoveryAudit: { event: async () => {} },
    log: {},
    environment: {},
    mariaProcess: {},
    restartMarker: { read },
  });
  await jest.advanceTimersByTimeAsync(14000);
  await pending;
  expect(read).toHaveBeenCalled();
  jest.useRealTimers();
});

{
  test("three supervisors converge on one winner and one lease", async () => {
    const nodes = [
      { name: "elera-0.example.test", local: true },
      { name: "elera-1.example.test", address: "elera-1.example.test" },
      { name: "elera-2.example.test", address: "elera-2.example.test" },
    ];
    const evidence = [
      {
        node: "elera-0.example.test",
        state: { node: "elera-0.example.test", uuid: "u", seqno: 10, safeToBootstrap: false },
        active: false,
      },
      {
        node: "elera-1.example.test",
        state: { node: "elera-1.example.test", uuid: "u", seqno: 12, safeToBootstrap: false },
        active: false,
      },
      {
        node: "elera-2.example.test",
        state: { node: "elera-2.example.test", uuid: "u", seqno: 11, safeToBootstrap: false },
        active: false,
      },
    ];
    const directory = await __fixture4_mkdtemp(
      __fixture4_join(__fixture4_tmpdir(), "elera-recovery-"),
    );
    const lease = __fixture4_createRecoveryLease(__fixture4_join(directory, "lease.json"));
    const decide = () =>
      __fixture4_createStartupRecoveryDecision({
        nodes,
        localEvidence: async () => evidence[0],
        fetchEvidence: async (node) => evidence.find((item) => item.node === node.name),
      })();
    const decisions = await Promise.all([decide(), decide(), decide()]);
    expect(new Set(decisions.map((item) => item.winner))).toEqual(
      new Set(["elera-1.example.test"]),
    );
    const claims = await Promise.all(
      decisions.map((item) => lease.claim({ epoch: item.epoch, winner: item.winner })),
    );
    expect(claims.filter((item) => item.granted && !item.existing)).toHaveLength(1);
    await __fixture4_rm(directory, { recursive: true, force: true });
  });

  test("active-primary recovery verifies both joiners before clearing drain", async () => {
    const calls = [];
    const fetchImpl = __fixture4_jest.fn(async (url) => {
      calls.push(url);
      if (url.endsWith("/status"))
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            data: {
              values: {
                wsrep_cluster_state_uuid: "cluster",
                wsrep_cluster_size: "3",
                wsrep_local_state_comment: "Synced",
                wsrep_ready: "ON",
                wsrep_cluster_status: "Primary",
              },
            },
          }),
        };
      return { ok: true, status: 202, json: async () => ({ ok: true, data: { status: "ready" } }) };
    });
    const recoveryState = { set: __fixture4_jest.fn() };
    const publishRecovery = __fixture4_jest.fn(async () => true);
    const __fixture4_join = __fixture4_createSupervisorRecoveryJoiner({
      identity: { name: "elera-0.example.test", address: "elera-0.example.test" },
      token: "root",
      timeoutMs: 100,
      recoveryState,
      recoveryAudit: { event: async () => {} },
      publishRecovery,
      fetchImpl,
    });
    await expect(
      __fixture4_join({
        bootstrap: { epoch: 1, clusterId: "cluster", winner: "elera-1.example.test" },
        members: [
          { name: "elera-0.example.test", address: "elera-0.cluster.local" },
          { name: "elera-1.example.test", address: "elera-1.cluster.local" },
          { name: "elera-2.example.test", address: "elera-2.cluster.local" },
        ],
      }),
    ).resolves.toEqual({ completed: ["elera-1.example.test", "elera-2.example.test"] });
    expect(calls).toEqual([
      "http://elera-1.cluster.local:8080/api/v1/cluster/cold-recovery/join",
      "http://elera-1.cluster.local:8080/api/v1/cluster/status",
      "http://elera-2.cluster.local:8080/api/v1/cluster/cold-recovery/join",
      "http://elera-2.cluster.local:8080/api/v1/cluster/status",
    ]);
    expect(publishRecovery).toHaveBeenCalledWith({
      epoch: 1,
      members: ["elera-1.example.test", "elera-2.example.test"],
    });
  });
}
