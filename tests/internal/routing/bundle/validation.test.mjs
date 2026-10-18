import { expect, test, describe } from "@jest/globals";
import { createSupervisorBundle } from "../../../../src/internal/routing/bundle/create.mjs";
import { validateSupervisorBundle } from "../../../../src/internal/routing/bundle/validation.mjs";
describe("negative bundle validation", () => {
  const routes = {
    primary: [{ host: "node", port: 3306, nodeId: "node" }],
    balanced: [{ host: "node", port: 3306, nodeId: "node" }],
  };

  test("rejects a null supervisor identity instead of manufacturing one", () => {
    expect(() =>
      createSupervisorBundle({
        database: "db",
        identity: "id",
        username: "u",
        password: "p",
        routes,
        expiresAt: "2099-01-01T00:00:00Z",
        nodeIdentity: null,
      }),
    ).toThrow();
  });

  test("rejects a bundle when no primary route or writer exists", () => {
    expect(() =>
      createSupervisorBundle({
        database: "db",
        identity: "id",
        username: "u",
        password: "p",
        routes: { primary: [], balanced: [{ host: "reader", port: 3306 }] },
        ports: { sql: 3306, http: 8080 },
        expiresAt: "2099-01-01T00:00:00Z",
      }),
    ).toThrow("writer host is required");
  });

  test("rejects malformed route collections and weights", () => {
    const valid = {
      apiVersion: "v1",
      application: "app",
      database: "db",
      physicalDatabase: "elera_db_1",
      identity: "id",
      credentials: { username: "u", password: "p" },
      writer: { host: "node", port: 3306, nodeId: "node" },
      readers: [{ host: "node", port: 3306, nodeId: "node" }],
      failover: [],
      bundleVersion: 1,
      expiresAt: "2099-01-01T00:00:00Z",
      nodeIdentity: "node",
      ports: { sql: 3306, http: 8080 },
      routes,
    };
    expect(() =>
      validateSupervisorBundle({ ...valid, routes: { primary: {}, balanced: [] } }),
    ).toThrow("routes.primary");
    expect(() =>
      validateSupervisorBundle({
        ...valid,
        routes: { primary: [], balanced: [{ host: "node", port: 3306, weight: -1 }] },
      }),
    ).toThrow("weight");
  });
});
