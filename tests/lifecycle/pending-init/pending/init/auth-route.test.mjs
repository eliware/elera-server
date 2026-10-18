import { expect, jest, test } from "@jest/globals";
import { handlePendingInitAuthRoute } from "../../../../../src/lifecycle/pending-init/pending/init/auth-route.mjs";

const response = () => ({
  writeHead: jest.fn(function () {
    return this;
  }),
  end: jest.fn(),
});

test("ignores auth requests outside guarded initialization paths", () => {
  expect(
    handlePendingInitAuthRoute({ method: "POST", url: "/api/v1/cluster/join" }, response(), {
      authorized: () => true,
    }),
  ).toBe(false);
});

test.each(["/api/v1/cluster/bootstrap", "/api/v1/initialization/apply"])(
  "rejects guarded path without auth: %s",
  (url) => {
    const target = response();
    expect(
      handlePendingInitAuthRoute({ method: "POST", url }, target, { authorized: () => false }),
    ).toBe(true);
    expect(target.writeHead).toHaveBeenCalledWith(401, { "content-type": "application/json" });
  },
);

test("blocks an authorized first boot while recovery is required", () => {
  const target = response();
  handlePendingInitAuthRoute({ method: "POST", url: "/api/v1/cluster/bootstrap" }, target, {
    authorized: () => true,
    recoveryReason: "recovery required",
  });
  expect(target.writeHead).toHaveBeenCalledWith(503, { "content-type": "application/json" });
  expect(target.end).toHaveBeenCalledWith(
    '{"ok":false,"error":"cluster recovery required. Initialization is not permitted","reason":"recovery required"}',
  );
});
