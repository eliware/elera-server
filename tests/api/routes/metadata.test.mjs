import { handleMetadataRoute } from "../../../src/api/routes/metadata.mjs";
const context = (method, path, metadata, body = {}) => {
  const out = {};
  const request = {
    async *[Symbol.asyncIterator]() {
      if (Object.keys(body).length) yield JSON.stringify(body);
    },
  };
  return {
    method,
    path,
    metadata,
    auth: { root: true },
    request,
    response: { json: (status, value) => Object.assign(out, { status, body: value }) },
    out,
  };
};
test("handles metadata status, initialization, and verification", async () => {
  const metadata = {
    status: async () => ({ initialized: true }),
    initialize: async () => ({ initialized: true }),
    verify: async () => ({ verified: true }),
  };
  for (const [method, path] of [
    ["GET", "/api/v1/metadata/status"],
    ["POST", "/api/v1/metadata/initialize"],
    ["POST", "/api/v1/metadata/verify"],
  ]) {
    const c = context(method, path, metadata, { confirm: true });
    expect(await handleMetadataRoute(c)).toBe(true);
    expect(c.out.status).toBe(200);
  }
});
test("returns unavailable verification and ignores unrelated routes", async () => {
  const c = context("POST", "/api/v1/metadata/verify", {
    verify: async () => ({ verified: false }),
  });
  expect(await handleMetadataRoute(c)).toBe(true);
  expect(c.out.status).toBe(503);
  const other = context("GET", "/other", {});
  expect(await handleMetadataRoute(other)).toBe(false);
});
test("rejects unconfirmed initialization", async () => {
  await expect(
    handleMetadataRoute({
      ...context("POST", "/api/v1/metadata/initialize", { initialize: async () => ({}) }),
      auth: { root: true },
    }),
  ).rejects.toThrow("confirm");
});

test("requires root for initialization and a read scope for status", async () => {
  const metadata = { status: async () => ({}), initialize: async () => ({}) };
  await expect(
    handleMetadataRoute({
      ...context("POST", "/api/v1/metadata/initialize", metadata, { confirm: true }),
      auth: { scopes: ["metadata:write"] },
    }),
  ).resolves.toBe(false);
  await expect(
    handleMetadataRoute({
      ...context("GET", "/api/v1/metadata/status", metadata),
      auth: { scopes: [] },
    }),
  ).resolves.toBe(false);
  await expect(
    handleMetadataRoute({
      ...context("POST", "/api/v1/metadata/verify", metadata),
      auth: { scopes: [] },
    }),
  ).resolves.toBe(false);
  await expect(handleMetadataRoute({})).resolves.toBe(false);
});
