import { expect, jest, test } from "@jest/globals";
import { handlePendingInitFallbackRoute } from "../../../src/lifecycle/pending-init/pending-init-fallback-route.mjs";

const response = () => ({
  writeHead: jest.fn(function () {
    return this;
  }),
  end: jest.fn(),
});

test.each([false, true])("returns a 503 fallback when recovery mode is %s", (recoveryRequired) => {
  const target = response();
  handlePendingInitFallbackRoute(target, { recoveryRequired, recoveryReason: "recovery required" });
  expect(target.writeHead).toHaveBeenCalledWith(503, { "content-type": "application/json" });
  expect(JSON.parse(target.end.mock.calls[0][0])).toMatchObject({ ok: false });
});
