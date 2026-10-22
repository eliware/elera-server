import { expect, test } from "@jest/globals";
import {
  validateRecoveryJoinerDependencies,
  validateRecoveryJoinRequest,
} from "../../../../src/runtime/recovery/join/validation.mjs";

const identity = { name: "node-a.example.test" };
const members = [
  { name: identity.name, address: identity.name },
  { name: "node-b.example.test", address: "node-b.example.test" },
];

test("requires an FQDN identity, a positive timeout, and a fetch function", () => {
  expect(() => validateRecoveryJoinerDependencies({})).toThrow("shared FQDN identity");
  expect(() =>
    validateRecoveryJoinerDependencies({ identity, timeoutMs: 0, fetchImpl: fetch }),
  ).toThrow("timeout and fetch");
  expect(() =>
    validateRecoveryJoinerDependencies({ identity, timeoutMs: 1.5, fetchImpl: fetch }),
  ).toThrow("timeout and fetch");
  expect(() =>
    validateRecoveryJoinerDependencies({ identity, timeoutMs: 1, fetchImpl: null }),
  ).toThrow("timeout and fetch");
  expect(() =>
    validateRecoveryJoinerDependencies({
      identity: { name: "node" },
      timeoutMs: 1,
      fetchImpl: fetch,
    }),
  ).toThrow("shared FQDN identity");
  expect(
    validateRecoveryJoinerDependencies({ identity, timeoutMs: 1, fetchImpl: fetch }),
  ).toBeUndefined();
});

test("requires valid members, a remote winner, and a local member", () => {
  expect(() => validateRecoveryJoinRequest(identity)).toThrow("FQDN identities and addresses");
  expect(() => validateRecoveryJoinRequest(identity, { members: [members[0]] })).toThrow(
    "FQDN identities and addresses",
  );
  expect(() => validateRecoveryJoinRequest(identity, { members: [members[0], null] })).toThrow(
    "FQDN identities and addresses",
  );
  expect(() =>
    validateRecoveryJoinRequest(identity, {
      members: [members[0], { name: "peer.example.test", address: "bad" }],
    }),
  ).toThrow("FQDN identities and addresses");
  for (const winner of ["missing.example.test", identity.name])
    expect(() => validateRecoveryJoinRequest(identity, { members, bootstrap: { winner } })).toThrow(
      "non-local winner",
    );
  expect(() =>
    validateRecoveryJoinRequest(
      { name: "other.example.test" },
      { members, bootstrap: { winner: members[1].name } },
    ),
  ).toThrow("not a configured recovery join member");
  expect(
    validateRecoveryJoinRequest(identity, { members, bootstrap: { winner: members[1] } }),
  ).toEqual({
    members,
    winner: members[1],
  });
});
