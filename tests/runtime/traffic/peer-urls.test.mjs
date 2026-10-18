import { expect, test } from "@jest/globals";
import { createTrafficPeerUrls } from "../../../src/runtime/traffic/peer-urls.mjs";

test("creates peer URLs and skips the local member", () => {
  expect(
    createTrafficPeerUrls(
      [
        { name: "local.example.test", address: "local.example.test" },
        { name: "peer.example.test", address: "peer.example.test" },
      ],
      "local.example.test",
      8080,
    ),
  ).toEqual(["http://peer.example.test:8080"]);
});

test("rejects peer names and URLs that do not match", () => {
  expect(() => createTrafficPeerUrls([{ name: "peer", address: "peer" }], "local", 80)).toThrow(
    "FQDN",
  );
  expect(() =>
    createTrafficPeerUrls(
      [
        {
          name: "peer.example.test",
          address: "peer.example.test",
          url: "http://other.example.test",
        },
      ],
      "local.example.test",
      80,
    ),
  ).toThrow("does not match");
});
