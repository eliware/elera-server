import { expect, test } from "@jest/globals";
import { normalizeDrainPeers } from "../../../src/cluster/drain/peer-targets.mjs";

test("normalizes, filters, and deduplicates peer targets", () => {
  expect(
    normalizeDrainPeers([
      "http://one.example.test/",
      "http://one.example.test",
      "https://two.example.test/path///",
      "",
      null,
    ]),
  ).toEqual(["http://one.example.test", "https://two.example.test/path"]);
});

test.each([
  123,
  "not a URL",
  "http://one",
  "http://127.0.0.1",
  "ftp://one.example.test",
  "http://one.example.test.",
])("rejects invalid peer target %s", (peer) => {
  expect(() => normalizeDrainPeers([peer])).toThrow("drain target peers must be FQDN URLs");
});

test("accepts an empty target list", () => {
  expect(normalizeDrainPeers(["", null, undefined])).toEqual([]);
  expect(normalizeDrainPeers()).toEqual([]);
});
