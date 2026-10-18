import { expect, test } from "@jest/globals";
import { toBundleVersion } from "../../../src/routing/bundle/version.mjs";

test("preserves valid numeric bundle versions", () => {
  expect(toBundleVersion(0)).toBe(0);
  expect(toBundleVersion(42)).toBe(42);
});

test("converts route hashes to safe contract versions", () => {
  expect(toBundleVersion("0123456789abcdef")).toBe(0x0123456789ab);
  expect(toBundleVersion("not-a-hash", 7)).toBe(7);
});
