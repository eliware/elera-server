import { expect, jest, test } from "@jest/globals";
import { createRoutingBundleService } from "../../../test-fixtures/routing/bundle-service-harness.mjs";
import bundleFixture from "../../../contracts/routing-bundle.fixture.json" with { type: "json" };
import { createRoutingBundleValidator } from "../../../src/routing/routing-bundle/validation.mjs";

test("returns a bundle summary after validation", async () => {
  const lease = jest.fn(async () => bundleFixture);
  const validate = createRoutingBundleValidator(lease);
  await expect(validate({ application: "app" })).resolves.toMatchObject({
    valid: true,
    application: "billing",
    database: "billing",
    bundleVersion: 1,
    routeCount: 3,
  });
});

test("returns lease failures as invalid results", async () => {
  const validate = createRoutingBundleValidator(async () => {
    throw new Error("lease unavailable");
  });
  await expect(validate()).resolves.toEqual({ valid: false, error: "lease unavailable" });
});

test("reports invalid bundles instead of throwing validation errors", async () => {
  const service = createRoutingBundleService({
    managed: { lease: async () => ({ identity: "id", routes: {} }) },
    observationStore: { snapshot: () => [] },
  });
  expect(await service.validate({ identity: "id" })).toMatchObject({
    valid: false,
    error: expect.stringContaining("required"),
  });
});
