import { expect, test } from "@jest/globals";
import { validateBundleRoutes } from "../../../../src/routing/bundle/route/validation.mjs";

test("accepts FQDN routes with and without node identifiers", () => {
  expect(
    validateBundleRoutes({
      primary: [{ host: "db.example.test", port: 3306 }],
      balanced: [{ host: "db.example.test", nodeId: "db.example.test", port: 3306 }],
    }),
  ).toHaveProperty("primary");
});

test("rejects route hosts that are not FQDNs", () => {
  expect(() =>
    validateBundleRoutes({ primary: [{ host: "db", port: 3306 }], balanced: [] }),
  ).toThrow("non-FQDN node identity");
});
