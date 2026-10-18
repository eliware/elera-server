import { expect, test, describe } from "@jest/globals";
import { validateBundle } from "@eliware/elera-lib";
import fixture from "../../../../contracts/routing-bundle.fixture.json" with { type: "json" };
import { createSupervisorBundle } from "../../../../src/internal/routing/bundle/create.mjs";
import { validateSupervisorBundle } from "../../../../src/internal/routing/bundle/validation.mjs";

describe("connection bundle contract", () => {
  const routes = {
    primary: [{ host: "sql0", port: 3306, weight: 100 }],
    balanced: [{ host: "sql0", port: 3306, weight: 100 }],
  };
  test("validates and builds a connection bundle", () => {
    const bundle = createSupervisorBundle({
      database: "app",
      identity: "runtime",
      username: "app",
      password: "secret",
      routes,
      ports: { sql: 3306, http: 8080 },
      expiresAt: "2099-01-01T00:00:00Z",
    });
    expect(bundle.routes.primary[0].port).toBe(3306);
  });
  test("preserves route node identity and bundle endpoint metadata", () => {
    const bundle = createSupervisorBundle({
      application: "payments",
      database: "app",
      identity: "runtime",
      username: "app",
      password: "secret",
      routes: {
        primary: [{ host: "sql0", port: 3306, nodeId: "node-0" }],
        balanced: [{ host: "sql0", port: 3306, nodeId: "node-0" }],
      },
      nodeIdentity: { name: "node-0", address: "10.0.0.60" },
      ports: { sql: 3306, http: 8080 },
      expiresAt: "2099-01-01T00:00:00Z",
    });
    expect(bundle.application).toBe("payments");
    expect(bundle.apiVersion).toBe("v1");
    expect(bundle.nodeIdentity).toBe("node-0");
    expect(bundle.ports).toEqual({ sql: 3306, http: 8080 });
    expect(bundle.routes.primary[0].nodeId).toBe("node-0");
  });
  test("derives route node identity from the host when omitted", () => {
    const bundle = createSupervisorBundle({
      database: "app",
      identity: "runtime",
      username: "app",
      password: "secret",
      routes: { primary: [{ host: "sql0", port: 3306 }], balanced: [{ host: "sql0", port: 3306 }] },
      ports: { sql: 3306, http: 8080 },
      expiresAt: "2099-01-01T00:00:00Z",
    });
    expect(bundle.routes.primary[0].nodeId).toBe("sql0");
    expect(bundle.routes.balanced[0].nodeId).toBe("sql0");
  });
  test("emits a bundle accepted by elera-lib", () => {
    const bundle = createSupervisorBundle({
      database: "app",
      identity: "runtime",
      username: "app",
      password: "secret",
      routes,
      ports: { sql: 3306, http: 8080 },
      expiresAt: "2099-01-01T00:00:00Z",
    });
    expect(validateBundle(bundle)).toEqual(bundle);
  });
  test("keeps the supervisor bundle fixture compatible with the canonical validator", () => {
    expect(validateBundle(fixture)).toEqual(fixture);
  });
  test("rejects incomplete or invalid bundles", () => {
    expect(() => validateSupervisorBundle(null)).toThrow();
    expect(() =>
      validateSupervisorBundle({
        database: "app",
        identity: "x",
        expiresAt: "2099-01-01T00:00:00Z",
        routes: { primary: [], balanced: [{ host: "x", port: 0 }] },
      }),
    ).toThrow();
  });
  test("rejects each missing bundle field and invalid route shape", () => {
    const valid = {
      apiVersion: "v1",
      application: "app",
      database: "app",
      physicalDatabase: "app",
      identity: "id",
      credentials: { username: "u", password: "p" },
      writer: { host: "sql0", port: 3306, nodeId: "sql0" },
      readers: [{ host: "sql0", port: 3306, nodeId: "sql0" }],
      failover: [],
      bundleVersion: 1,
      nodeIdentity: "sql0",
      ports: { sql: 3306, http: 8080 },
      expiresAt: "2099-01-01T00:00:00Z",
      routes,
    };
    expect(() => validateSupervisorBundle({})).toThrow("apiVersion");
    expect(() => validateSupervisorBundle({ ...valid, database: undefined })).toThrow("database");
    expect(() => validateSupervisorBundle({ ...valid, expiresAt: undefined })).toThrow("expiresAt");
    expect(() => validateSupervisorBundle({ ...valid, routes: { primary: {} } })).toThrow(
      "routes.primary",
    );
    expect(() =>
      validateSupervisorBundle({
        ...valid,
        routes: { ...routes, primary: [{ host: "", port: 3306 }] },
      }),
    ).toThrow();
    expect(() =>
      validateSupervisorBundle({
        ...valid,
        routes: { ...routes, balanced: [{ host: "x", port: 3306, weight: -1 }] },
      }),
    ).toThrow("weight");
  });
  test("rejects a builder call without route arrays after evaluating defaults", () => {
    expect(() =>
      createSupervisorBundle({
        database: "app",
        identity: "id",
        expiresAt: "2099-01-01T00:00:00Z",
      }),
    ).toThrow("route primary");
  });
});
