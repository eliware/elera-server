import { createManagedMetadataForTest } from "../../../test-fixtures/managed-metadata.mjs";
import { createSecretBox } from "../../../src/metadata/secret-box.mjs";
import { createHash } from "node:crypto";
import { expect, test } from "@jest/globals";
import {
  validFqdn,
  validName,
  hashToken,
  createPassword,
  createToken,
} from "../../../src/metadata/managed/validation.mjs";

test("validates metadata names and node names", () => {
  expect(validName("user_1", "identity")).toBe("user_1");
  expect(validFqdn("db.example.test", "node")).toBe("db.example.test");
  expect(() => validName("bad name", "identity")).toThrow("identity is invalid");
  expect(() => validFqdn("bad", "node")).toThrow("valid hostname");
  expect(hashToken("value")).toHaveLength(64);
  expect(createPassword()).toHaveLength(32);
  expect(createToken()).toHaveLength(43);
});

test("validates managed names, purposes, and grants", async () => {
  expect(() => createManagedMetadataForTest()).toThrow("query function");
  const managed = createManagedMetadataForTest({
    credentialKey: "test-key",
    query: async () => [[]],
  });
  await expect(
    managed.createDatabase({ application: "bad name", databaseName: "db" }),
  ).rejects.toThrow("application is invalid");
  await expect(
    managed.createIdentity({
      application: "app",
      databaseName: "db",
      identity: "id",
      purpose: "owner",
    }),
  ).rejects.toThrow("purpose is invalid");
  await expect(
    managed.createIdentity({
      application: "app",
      databaseName: "db",
      identity: "id",
      grants: ["GRANT OPTION"],
    }),
  ).rejects.toThrow("invalid grant policy");
  expect(await managed.authenticate()).toBeNull();
  expect(await managed.authenticate("missing")).toBeNull();
  const empty = createManagedMetadataForTest({ query: async () => [[]] });
  expect(await empty.authenticate("missing")).toBeNull();
  const noScopes = createManagedMetadataForTest({
    query: async () => [
      [
        {
          name: "token",
          token_hash: createHash("sha256").update("token").digest("hex"),
          scopes_json: null,
        },
      ],
    ],
  });
  expect((await noScopes.authenticate("token")).scopes).toEqual([]);
  const serializedScopes = createManagedMetadataForTest({
    query: async () => [
      [
        {
          name: "token",
          token_hash: createHash("sha256").update("token").digest("hex"),
          scopes_json: '["database:write"]',
        },
      ],
    ],
  });
  expect((await serializedScopes.authenticate("token")).scopes).toEqual(["database:write"]);
  const arrayScopes = createManagedMetadataForTest({
    query: async () => [
      [
        {
          name: "token",
          token_hash: createHash("sha256").update("token").digest("hex"),
          scopes_json: ["database:admin"],
        },
      ],
    ],
  });
  expect((await arrayScopes.authenticate("token")).scopes).toEqual(["database:admin"]);
  const malformed = createManagedMetadataForTest({ query: async () => [[{ name: "malformed" }]] });
  expect(await malformed.authenticate("token")).toBeNull();
  const unconfigured = createManagedMetadataForTest({ query: async () => [[]] });
  await expect(
    unconfigured.createIdentity({ application: "app", databaseName: "db", identity: "id" }),
  ).rejects.toThrow("encryption");
  await expect(unconfigured.rotateIdentity("id")).rejects.toThrow("encryption");
  await expect(unconfigured.lease({ identity: "id" })).rejects.toThrow("encryption");
  const rotating = createManagedMetadataForTest({
    credentialKey: "test-key",
    query: async (sql) =>
      sql.includes("SELECT username") ? [[{ username: "payments_runtime" }]] : [[]],
  });
  expect((await rotating.rotateIdentity("runtime")).rotated).toBe(true);
  const missingIdentity = createManagedMetadataForTest({
    credentialKey: "test-key",
    query: async () => [[]],
  });
  await expect(missingIdentity.rotateIdentity("runtime")).rejects.toThrow("identity not found");
  const tokenIdentityMissing = createManagedMetadataForTest({
    credentialKey: "test-key",
    query: async () => [[]],
  });
  await expect(
    tokenIdentityMissing.issueToken({ tokenName: "token", application: "app", identity: "id" }),
  ).rejects.toThrow("identity not found");
  const sealed = createSecretBox("test-key").seal("password");
  const leasing = createManagedMetadataForTest({
    credentialKey: "test-key",
    query: async () => [
      [
        {
          application: "payments",
          database: "billing",
          physical_database: "elera_db_42",
          username: "payments_runtime",
          credential_ciphertext: sealed,
        },
      ],
    ],
  });
  await expect(leasing.lease({ identity: "runtime" })).resolves.toMatchObject({
    database: "billing",
    physicalDatabase: "elera_db_42",
    password: "password",
  });
  const missingLease = createManagedMetadataForTest({
    credentialKey: "test-key",
    query: async () => [[]],
  });
  await expect(missingLease.lease({ identity: "runtime" })).rejects.toThrow("identity not found");
  const query = async (sql) =>
    sql.includes("'missing'")
      ? [[]]
      : sql.includes("SELECT database_id")
        ? [[{ database_id: "db-1", name: "billing", application: "payments" }]]
        : [[]];
  const deletions = createManagedMetadataForTest({ query });
  await expect(deletions.deleteDatabase()).rejects.toMatchObject({ statusCode: 400 });
  await expect(deletions.deleteDatabase({})).rejects.toMatchObject({ statusCode: 400 });
  await expect(
    deletions.deleteDatabase({ databaseId: "db-1", dryRun: true, idempotencyKey: "dry" }),
  ).resolves.toMatchObject({ status: "planned", changed: false });
  await expect(
    deletions.deleteDatabase({ databaseId: "db-1", dryRun: true }),
  ).resolves.toMatchObject({ status: "planned" });
  await expect(deletions.deleteDatabase({ databaseId: "db-1" })).rejects.toMatchObject({
    statusCode: 409,
  });
  await expect(
    deletions.deleteDatabase({ databaseId: "db-1", confirm: true, idempotencyKey: "done" }),
  ).resolves.toMatchObject({ status: "completed", changed: true });
  await expect(
    deletions.deleteDatabase({ databaseId: "db-1", confirm: true, idempotencyKey: "done" }),
  ).resolves.toMatchObject({ status: "completed" });
  await expect(
    deletions.deleteDatabase({ databaseId: "missing", dryRun: true }),
  ).rejects.toMatchObject({ statusCode: 404 });
});
