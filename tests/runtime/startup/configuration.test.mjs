import { expect, jest, test } from "@jest/globals";
import { loadSupervisorStartupConfiguration } from "../../../src/runtime/startup/configuration.mjs";

test("loads intent, publishes cluster size, applies intent, and builds MariaDB args", async () => {
  const intent = {
    cluster: {
      members: [
        { name: "node-a.example.test", address: "node-a.example.test" },
        { name: "node-b.example.test", address: "node-b.example.test" },
      ],
    },
  };
  const intentState = { paths: { renderedPath: "/state/mariadb.cnf" }, apply: jest.fn() };
  const routingEnvironment = {};
  const mariaArguments = jest.fn(() => ["--defaults-extra-file=/state/mariadb.cnf"]);
  await expect(
    loadSupervisorStartupConfiguration({
      intentState,
      loadEnvironmentIntent: jest.fn(),
      identity: { name: "node-a.example.test" },
      routingEnvironment,
      config: { dataDir: "/data" },
      loadIntentImpl: jest.fn(async () => intent),
      mariaArguments,
      resolveAddress: jest.fn(async () => []),
    }),
  ).resolves.toEqual({ initialIntent: intent, args: ["--defaults-extra-file=/state/mariadb.cnf"] });
  expect(routingEnvironment.ELERA_CLUSTER_SIZE).toBe("2");
  expect(intentState.apply).toHaveBeenCalledWith(intent);
  expect(mariaArguments).toHaveBeenCalledWith(
    { dataDir: "/data", intentConfigPath: "/state/mariadb.cnf" },
    { name: "node-a.example.test" },
  );
});

test("validates startup dependencies and an empty cluster intent", async () => {
  await expect(loadSupervisorStartupConfiguration()).rejects.toThrow("valid hostname");
  const identity = { name: "node-a.example.test" };
  const shared = {
    intentState: { apply: jest.fn(), paths: { renderedPath: "/state.cnf" } },
    loadEnvironmentIntent: jest.fn(),
    identity,
    routingEnvironment: {},
    config: {},
    loadIntentImpl: jest.fn(async () => ({ cluster: { members: [] } })),
    mariaArguments: jest.fn(),
  };
  await expect(
    loadSupervisorStartupConfiguration({ ...shared, identity: { name: "node-a" } }),
  ).rejects.toThrow("valid hostname");
  await expect(
    loadSupervisorStartupConfiguration({ ...shared, intentState: undefined }),
  ).rejects.toThrow("dependencies are required");
  await expect(loadSupervisorStartupConfiguration(shared)).rejects.toThrow(
    "must define cluster members",
  );
});

test("applies a single-node intent and uses default loaders and MariaDB arguments", async () => {
  const intent = {
    apiVersion: "elera.eliware.dev/v1alpha1",
    kind: "SupervisorIntent",
    cluster: {
      name: "local",
      members: [{ name: "node-a.example.test", address: "node-a.example.test" }],
    },
    mariadb: { port: 3306 },
    routing: { healthIntervalMs: 1000 },
    drain: { queryTimeoutMs: 1 },
  };
  const intentState = {
    paths: { renderedPath: "/state.cnf" },
    read: jest.fn(async () => intent),
    apply: jest.fn(),
  };
  const routingEnvironment = {};
  const result = await loadSupervisorStartupConfiguration({
    intentState,
    loadEnvironmentIntent: jest.fn(),
    identity: { name: "node-a.example.test" },
    routingEnvironment,
    config: { elera: false, dataDir: "/data" },
  });
  expect(result.args).toContain("--datadir=/data");
  expect(routingEnvironment.ELERA_CLUSTER_SIZE).toBe("1");
  expect(intentState.apply).toHaveBeenCalledWith(intent);
});

test("uses the default DNS resolver for a multi-member intent", async () => {
  await expect(
    loadSupervisorStartupConfiguration({
      intentState: { paths: {}, apply: jest.fn() },
      loadEnvironmentIntent: jest.fn(),
      identity: { name: "node-a.example.test" },
      routingEnvironment: {},
      config: {},
      loadIntentImpl: jest.fn(async () => ({
        cluster: {
          members: [
            { name: "node-a.example.test", address: "localhost" },
            { name: "node-b.example.test", address: "localhost" },
          ],
        },
      })),
      mariaArguments: jest.fn(() => []),
    }),
  ).resolves.toMatchObject({ args: [] });
});

test("reports member hostname resolution failures", async () => {
  const intent = {
    cluster: {
      members: [
        { name: "node-a.example.test", address: "node-a.example.test" },
        { name: "node-b.example.test", address: "bad.example.test" },
      ],
    },
  };
  await expect(
    loadSupervisorStartupConfiguration({
      intentState: { paths: {}, apply: jest.fn() },
      loadEnvironmentIntent: jest.fn(),
      identity: { name: "node-a.example.test" },
      routingEnvironment: {},
      config: {},
      loadIntentImpl: jest.fn(async () => intent),
      mariaArguments: jest.fn(),
      resolveAddress: jest.fn(async (host) => {
        if (host === "bad.example.test") throw new Error("lookup failed");
        return [];
      }),
    }),
  ).rejects.toMatchObject({ message: expect.stringContaining("lookup failed") });
});
