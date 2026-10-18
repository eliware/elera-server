import { expect, test } from "@jest/globals";
import { createControlRequestContext } from "../../../../src/api/control/api/context.mjs";

test("builds request context with direct values and lazy state", () => {
  const request = { method: "GET" };
  const url = new URL("http://localhost/api/v1/status");
  const response = { json: () => {} };
  const context = createControlRequestContext(request, url, response, {
    identity: { name: "node.example.test" },
    auth: { root: true },
    coldBootstrap: undefined,
    getColdBootstrap: () => "bootstrap",
    coldEvidence: undefined,
    getColdEvidence: () => "evidence",
    getColdRecoveryProtocol: () => "protocol",
  });
  expect(context).toMatchObject({
    method: "GET",
    path: "/api/v1/status",
    request,
    response,
    coldBootstrap: "bootstrap",
    coldEvidence: "evidence",
    coldRecoveryProtocol: "protocol",
  });
});
