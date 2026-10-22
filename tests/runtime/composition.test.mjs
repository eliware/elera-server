import { expect, test } from "@jest/globals";
import { createSupervisorComposition } from "../../src/runtime/composition.mjs";

test("validates query functions and runtime identity", () => {
  expect(() => createSupervisorComposition()).toThrow("query dependencies");
  expect(() =>
    createSupervisorComposition({ query: async () => [[], []], optionalQuery: null }),
  ).toThrow("query dependencies");
  expect(() =>
    createSupervisorComposition({ query: async () => [[], []], identity: { name: "invalid" } }),
  ).toThrow("valid hostname");
  expect(() =>
    createSupervisorComposition({ query: async () => [[], []], identity: undefined }),
  ).toThrow("valid hostname");
});

test("composes metadata and durable observation services from injected dependencies", () => {
  const result = createSupervisorComposition({
    environment: {
      MARIADB_DATA_DIR: "/data",
      ELERA_OBSERVATION_STATE_PATH: "/run/observations.json",
      ELERA_CREDENTIAL_KEY: "key",
    },
    identity: { name: "node.example.test", address: "node.example.test" },
    log: {},
    query: async () => [[], []],
  });
  expect(result).toEqual(
    expect.objectContaining({
      intentState: expect.any(Object),
      observationStore: expect.any(Object),
      metadata: expect.any(Object),
      managed: expect.any(Object),
      applications: expect.any(Object),
      reconciler: expect.any(Object),
      artifactStore: expect.any(Object),
    }),
  );
});

test("uses in-memory observations and optional query dependency by default", () => {
  const result = createSupervisorComposition({
    environment: {},
    identity: { name: "node.example.test", address: "node.example.test" },
    log: {},
    query: async () => [[], []],
  });
  expect(result.observationStore.initialize).toBeUndefined();
});
