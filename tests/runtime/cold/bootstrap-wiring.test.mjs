import { expect, jest, test } from "@jest/globals";
import { createSupervisorColdBootstrap } from "../../../src/runtime/cold/bootstrap-wiring.mjs";

test("validates coordinator dependencies when options are omitted", () => {
  expect(() => createSupervisorColdBootstrap()).toThrow("complete FQDN node inventory");
});

test("wires local and remote cold-bootstrap execution", async () => {
  let options;
  const fetchImpl = jest.fn(async () => ({ ok: true, json: async () => ({ completed: true }) }));
  const coordinator = createSupervisorColdBootstrap({
    members: [{ name: "node-b.example.test", url: "http://node-b.example.test" }],
    localEvidence: {},
    remoteEvidence: jest.fn(),
    bootstrapLocal: jest.fn(),
    config: { timeoutMs: 10 },
    environment: { ROOT_TOKEN: "root", ELERA_PEER_TOKEN: "peer" },
    log: {},
    fetchImpl,
    createCoordinator: (value) => {
      options = value;
      return { marker: true };
    },
  });
  expect(coordinator).toEqual({ marker: true });
  await expect(options.bootstrapRemote({ url: "http://node-b.example.test" })).resolves.toEqual({
    completed: true,
  });
  expect(fetchImpl).toHaveBeenCalledWith(
    "http://node-b.example.test/api/v1/cluster/cold-bootstrap/local",
    expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({
        "x-elera-peer-token": "peer",
        authorization: "Bearer root",
      }),
    }),
  );
});

test("uses the pre-shared root token for peer bootstrap when no peer token is set", async () => {
  let options;
  const fetchImpl = jest.fn(async () => ({ ok: true, json: async () => ({ completed: true }) }));
  createSupervisorColdBootstrap({
    members: [{ name: "node-b.example.test", url: "http://node-b.example.test" }],
    localEvidence: {},
    remoteEvidence: jest.fn(),
    bootstrapLocal: jest.fn(),
    config: { timeoutMs: 10 },
    environment: { ROOT_TOKEN: "pre-shared-root" },
    log: {},
    fetchImpl,
    createCoordinator: (value) => {
      options = value;
      return value;
    },
  });

  await options.bootstrapRemote({ url: "http://node-b.example.test" });

  expect(fetchImpl.mock.calls[0][1].headers).toEqual(
    expect.objectContaining({
      "x-elera-peer-token": "pre-shared-root",
      authorization: "Bearer pre-shared-root",
    }),
  );
});

test("rejects failed remote cold-bootstrap responses", async () => {
  let options;
  createSupervisorColdBootstrap({
    members: [],
    localEvidence: {},
    remoteEvidence: jest.fn(),
    bootstrapLocal: jest.fn(),
    config: { timeoutMs: 10 },
    environment: { ROOT_TOKEN: "root" },
    log: {},
    fetchImpl: async () => ({ ok: false, status: 409 }),
    createCoordinator: (value) => {
      options = value;
      return value;
    },
  });
  await expect(options.bootstrapRemote({ url: "http://node" })).rejects.toMatchObject({
    statusCode: 409,
  });
});
