import { jest } from "@jest/globals";
import { join } from "node:path";
import { installMemoryFileSystem } from "../../../test-fixtures/memory-filesystem.mjs";

const __memoryFs = installMemoryFileSystem(jest);
jest.unstable_mockModule("node:fs/promises", () => __memoryFs);
jest.unstable_mockModule("node:fs", () => __memoryFs);
jest.unstable_mockModule("node:os", () => ({ tmpdir: () => "/tmp" }));
const { mkdir, mkdtemp, rm, writeFile } = __memoryFs;
const tmpdir = () => "/tmp";
const { createRecoveryLease } = await import("../../../src/cluster/cold-bootstrap/lease.mjs");

test("grants one epoch and rejects competing epochs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "elera-lease-"));
  const lease = createRecoveryLease(join(directory, "lease.json"));
  await expect(lease.claim({ epoch: "e1", winner: "a.example.test" })).resolves.toMatchObject({
    granted: true,
  });
  await expect(lease.claim({ epoch: "e1", winner: "a.example.test" })).resolves.toMatchObject({
    granted: true,
    existing: true,
  });
  await expect(lease.claim({ epoch: "e2", winner: "b.example.test" })).resolves.toMatchObject({
    granted: false,
  });
  await rm(directory, { recursive: true, force: true });
});

test("requires lease path and claim identity", async () => {
  expect(() => createRecoveryLease()).toThrow("recovery lease path is required");
  const lease = createRecoveryLease("x");
  await expect(lease.claim()).rejects.toThrow("recovery lease epoch and FQDN winner are required");
});

test("releases only the requested lease and allows a later epoch", async () => {
  const directory = await mkdtemp(join(tmpdir(), "elera-lease-"));
  const path = join(directory, "lease.json");
  const lease = createRecoveryLease(path);
  await lease.claim({ epoch: "e1", winner: "a.example.test" });
  await expect(lease.release({ epoch: "other" })).resolves.toBe(false);
  await expect(lease.release({ winner: "other.example.test" })).resolves.toBe(false);
  await expect(lease.release({ epoch: "e1", winner: "a.example.test" })).resolves.toBe(true);
  await expect(lease.claim({ epoch: "e2", winner: "b.example.test" })).resolves.toMatchObject({
    granted: true,
  });
  await rm(directory, { recursive: true, force: true });
});

test("returns false when release finds no lease", async () => {
  const lease = createRecoveryLease("missing.json");
  await expect(lease.release()).resolves.toBe(false);
});

test("propagates unexpected lease release storage failures", async () => {
  const lease = createRecoveryLease("lease.json", {
    readLease: async () => {
      const error = new Error("storage unavailable");
      error.code = "EIO";
      throw error;
    },
  });
  await expect(lease.release()).rejects.toMatchObject({ code: "EIO" });
});

test("handles a lease removed by another process during release", async () => {
  const lease = createRecoveryLease("lease.json", {
    readLease: async () => JSON.stringify({ epoch: "e1", winner: "a.example.test" }),
    removeLease: async () => {
      const error = new Error("lease already removed");
      error.code = "ENOENT";
      throw error;
    },
  });
  await expect(lease.release()).resolves.toBe(false);
});

test("propagates unexpected lease removal failures", async () => {
  const lease = createRecoveryLease("lease.json", {
    readLease: async () => JSON.stringify({ epoch: "e1", winner: "a.example.test" }),
    removeLease: async () => {
      const error = new Error("storage unavailable");
      error.code = "EIO";
      throw error;
    },
  });
  await expect(lease.release()).rejects.toMatchObject({ code: "EIO" });
});

test("rejects a lease path that cannot be opened as a file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "elera-lease-"));
  const path = join(directory, "lease");
  await mkdir(path);
  const lease = createRecoveryLease(path);
  await expect(lease.claim({ epoch: "e1", winner: "a.example.test" })).resolves.toMatchObject({
    granted: false,
  });
  await rm(directory, { recursive: true, force: true });
});

test("does not trust a malformed existing lease", async () => {
  const directory = await mkdtemp(join(tmpdir(), "elera-lease-"));
  const path = join(directory, "lease.json");
  await writeFile(path, "{");
  const lease = createRecoveryLease(path);
  await expect(lease.claim({ epoch: "e1", winner: "a.example.test" })).resolves.toMatchObject({
    granted: false,
  });
  await rm(directory, { recursive: true, force: true });
});

test("propagates unexpected lease storage failures", async () => {
  const lease = createRecoveryLease("lease.json", {
    openFile: async () => {
      const error = new Error("storage unavailable");
      error.code = "EIO";
      throw error;
    },
  });
  await expect(lease.claim({ epoch: "e1", winner: "a.example.test" })).rejects.toMatchObject({
    code: "EIO",
  });
});

test("replaces an expired competing lease after exclusive cleanup locking", async () => {
  const directory = await mkdtemp(join(tmpdir(), "elera-lease-"));
  const path = join(directory, "lease.json");
  await writeFile(
    path,
    JSON.stringify({ epoch: "old", winner: "old", claimedAt: new Date(0).toISOString() }),
  );
  const lease = createRecoveryLease(path, { staleAfterMs: 100, now: () => 1000 });
  await expect(lease.claim({ epoch: "new", winner: "new.example.test" })).resolves.toMatchObject({
    granted: true,
    epoch: "new",
  });
  await rm(directory, { recursive: true, force: true });
});

test("denies stale cleanup while another process owns the cleanup lock", async () => {
  const directory = await mkdtemp(join(tmpdir(), "elera-lease-"));
  const path = join(directory, "lease.json");
  await writeFile(
    path,
    JSON.stringify({ epoch: "old", winner: "old", claimedAt: new Date(0).toISOString() }),
  );
  await writeFile(`${path}.cleanup-lock`, "busy");
  const lease = createRecoveryLease(path, { staleAfterMs: 100, now: () => 1000 });
  await expect(lease.claim({ epoch: "new", winner: "new.example.test" })).resolves.toMatchObject({
    granted: false,
    reason: "stale recovery lease cleanup is in progress",
  });
  await rm(directory, { recursive: true, force: true });
});

test("keeps a changed lease and tolerates cleanup failures", async () => {
  let reads = 0;
  const handle = {
    writeFile: async () => {},
    close: async () => {
      throw new Error("closed");
    },
  };
  const lease = createRecoveryLease("lease.json", {
    openFile: async () => {
      if (reads === 0) throw Object.assign(new Error("exists"), { code: "EEXIST" });
      return handle;
    },
    readLease: async () => {
      reads += 1;
      return JSON.stringify(
        reads === 1
          ? { epoch: "old", winner: "old", claimedAt: new Date(0).toISOString() }
          : {
              epoch: "newer",
              winner: "newer.example.test",
              claimedAt: new Date(1000).toISOString(),
            },
      );
    },
    removeLease: async () => {
      throw new Error("removed");
    },
    staleAfterMs: 100,
    now: () => 1000,
  });
  await expect(lease.claim({ epoch: "new", winner: "new.example.test" })).resolves.toMatchObject({
    granted: false,
    reason: "recovery lease changed during cleanup",
  });
});

test("denies cleanup when the exclusive lock cannot be created", async () => {
  let opens = 0;
  const lease = createRecoveryLease("lease.json", {
    openFile: async () => {
      opens += 1;
      const error = new Error("failure");
      error.code = opens === 1 ? "EEXIST" : "EIO";
      throw error;
    },
    readLease: async () =>
      JSON.stringify({
        epoch: "old",
        winner: "old",
        claimedAt: new Date(0).toISOString(),
      }),
    staleAfterMs: 100,
    now: () => 1000,
  });
  await expect(lease.claim({ epoch: "new", winner: "new.example.test" })).resolves.toMatchObject({
    granted: false,
    reason: "recovery lease is held by different epoch",
  });
});
