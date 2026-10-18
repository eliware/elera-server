import { expect, jest, test } from "@jest/globals";

const captured = {};
const server = { listen: jest.fn(), close: jest.fn() };
const coldRecovery = {
  evidence: "evidence",
  members: [{ name: "node.example.test" }],
  protocol: { plan: jest.fn() },
};
jest.unstable_mockModule("../../../../src/runtime/cold/recovery-wiring.mjs", () => ({
  createSupervisorColdRecovery: jest.fn(() => coldRecovery),
}));
jest.unstable_mockModule("../../../../src/runtime/startup/decision-wiring.mjs", () => ({
  resolveExplicitSupervisorStartup: jest.fn(async ({ environment, args }) =>
    environment.EXPLICIT
      ? { explicit: true, decision: { mode: "bootstrap" }, args: [...args, "explicit"] }
      : { explicit: false, args },
  ),
}));
jest.unstable_mockModule("../../../../src/runtime/clean-restart/recovery.mjs", () => ({
  resolveCleanRestart: jest.fn(async ({ restartMarker }) => restartMarker ?? undefined),
}));
jest.unstable_mockModule("../../../../src/runtime/recovery/evidence-service.mjs", () => ({
  startRecoveryEvidenceService: jest.fn(async (options) => {
    captured.evidence = options;
    if (options.unifiedListener) options.setStartupHandler?.("routes");
    return { completion: "completion", server, routes: "routes" };
  }),
}));
const { prepareRecoveryStartupServices } =
  await import("../../../../src/runtime/recovery/startup/services.mjs");

const base = {
  startupConfiguration: { initialIntent: { cluster: { members: [] } }, args: ["base"] },
  config: { dataDir: "/data", httpPort: 8080, elera: false },
  identity: { name: "node.example.test" },
  health: {},
  recoveryState: { set: jest.fn() },
  recoveryAudit: {},
  log: { debug: jest.fn() },
  mariaProcess: {},
  getMariaProcess: () => ({}),
  environment: {},
};

test("prepares standalone and explicit startup services", async () => {
  await expect(prepareRecoveryStartupServices(base)).resolves.toMatchObject({
    startupDecision: { mode: "standalone" },
    localEvidence: undefined,
  });
  await expect(
    prepareRecoveryStartupServices({
      ...base,
      config: { ...base.config, elera: true },
      environment: { EXPLICIT: true },
    }),
  ).resolves.toMatchObject({ args: ["base", "explicit"], startupDecision: { mode: "bootstrap" } });
});

test("starts recovery evidence and marks a clean join", async () => {
  const result = await prepareRecoveryStartupServices({
    ...base,
    config: { ...base.config, elera: true },
    probes: {},
    restartMarker: { mode: "join" },
  });
  expect(result).toMatchObject({ joined: true, needsPlan: true, recoveryCompletion: "completion" });
  expect(server.close).toHaveBeenCalled();
  expect(captured.evidence.unifiedListener).toBe(false);
});

test("uses an existing listener for evidence routes and a normal recovery plan", async () => {
  const setStartupHandler = jest.fn();
  const result = await prepareRecoveryStartupServices({
    ...base,
    config: { ...base.config, elera: true },
    probes: { setStartupHandler },
  });
  expect(result).toMatchObject({ needsPlan: true, unifiedListener: true });
  expect(setStartupHandler).toHaveBeenCalledWith("routes");
  expect(captured.evidence.unifiedListener).toBe(true);
});
