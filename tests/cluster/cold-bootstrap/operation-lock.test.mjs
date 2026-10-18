import { expect, jest, test } from "@jest/globals";
import { join } from "node:path";
import { installMemoryFileSystem } from "../../../test-fixtures/memory-filesystem.mjs";

const __memoryFs = installMemoryFileSystem(jest);
jest.unstable_mockModule("node:fs/promises", () => __memoryFs);
jest.unstable_mockModule("node:fs", () => __memoryFs);
jest.unstable_mockModule("node:os", () => ({ tmpdir: () => "/tmp" }));
const { mkdtemp, rm, utimes, writeFile } = __memoryFs;
const tmpdir = () => "/tmp";
const { createOperationLock } =
  await import("../../../src/cluster/cold-bootstrap/operation-lock.mjs");

jest.useFakeTimers();
test("runs without a lock path and cleans a normal lock after completion", async () => {
  const result = await createOperationLock().run(async () => "ok");
  expect(result).toBe("ok");
  const dir = await mkdtemp(join(tmpdir(), "elera-lock-"));
  const path = join(dir, "lock");
  try {
    const lock = createOperationLock({ path });
    await expect(lock.run(async () => "done")).resolves.toBe("done");
    await expect(lock.run(async () => "again")).resolves.toBe("again");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("rejects a live lock and removes a stale lock", async () => {
  const dir = await mkdtemp(join(tmpdir(), "elera-lock-"));
  const path = join(dir, "lock");
  try {
    let acquired;
    const ready = new Promise((resolve) => {
      acquired = resolve;
    });
    const lock = createOperationLock({
      path,
      staleAfterMs: 100000,
      openFile: async (...args) => {
        const handle = await __memoryFs.open(...args);
        acquired();
        return handle;
      },
    });
    let release;
    const held = lock.run(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    await ready;
    await expect(lock.run(async () => "blocked")).rejects.toMatchObject({ statusCode: 409 });
    release("released");
    await expect(held).resolves.toBe("released");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("removes a stale lock and retries the operation", async () => {
  const dir = await mkdtemp(join(tmpdir(), "elera-lock-"));
  const path = join(dir, "lock");
  try {
    await writeFile(path, "stale");
    await utimes(path, new Date(0), new Date(0));
    await expect(
      createOperationLock({ path, staleAfterMs: 1 }).run(async () => "recovered"),
    ).resolves.toBe("recovered");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("propagates non-contention filesystem errors", async () => {
  await expect(
    createOperationLock({ path: "\0invalid-lock" }).run(async () => "never"),
  ).rejects.toThrow();
});

test("retries when a competing lock disappears during inspection", async () => {
  let opens = 0;
  const openFile = async () => {
    opens += 1;
    if (opens === 1) throw Object.assign(new Error("exists"), { code: "EEXIST" });
    return { writeFile: async () => {}, close: async () => {} };
  };
  const statFile = async () => {
    throw Object.assign(new Error("disappeared"), { code: "ENOENT" });
  };
  const remove = async () => {};
  await expect(
    createOperationLock({
      path: "lock",
      makeDirectory: async () => {},
      openFile,
      statFile,
      remove,
    }).run(async () => "retried"),
  ).resolves.toBe("retried");
});

test("returns a conflict for a fresh competing lock", async () => {
  const openFile = async () => {
    throw Object.assign(new Error("exists"), { code: "EEXIST" });
  };
  await expect(
    createOperationLock({
      path: "lock",
      makeDirectory: async () => {},
      openFile,
      statFile: async () => ({ mtimeMs: Date.now() }),
      remove: async () => {},
    }).run(async () => "blocked"),
  ).rejects.toMatchObject({ statusCode: 409 });
});

test("propagates inspection failures other than a disappeared lock", async () => {
  const openFile = async () => {
    throw Object.assign(new Error("exists"), { code: "EEXIST" });
  };
  await expect(
    createOperationLock({
      path: "lock",
      makeDirectory: async () => {},
      openFile,
      statFile: async () => {
        throw new Error("permission denied");
      },
      remove: async () => {},
    }).run(async () => "blocked"),
  ).rejects.toThrow("permission denied");
});

test("tolerates cleanup failures after the operation completes", async () => {
  const handle = {
    writeFile: async () => {},
    close: async () => {
      throw new Error("already closed");
    },
  };
  const lock = createOperationLock({
    path: "lock",
    makeDirectory: async () => {},
    openFile: async () => handle,
    remove: async () => {
      throw new Error("already removed");
    },
  });
  await expect(lock.run(async () => "ok")).resolves.toBe("ok");
});

test("cleans up a lock when lock metadata cannot be written", async () => {
  const handle = {
    writeFile: async () => {
      throw new Error("disk full");
    },
    close: jest.fn(async () => {}),
  };
  const remove = jest.fn(async () => {});
  const lock = createOperationLock({
    path: "lock",
    makeDirectory: async () => {},
    openFile: async () => handle,
    remove,
  });
  await expect(lock.run(async () => "never")).rejects.toThrow("disk full");
  expect(handle.close).toHaveBeenCalled();
  expect(remove).toHaveBeenCalledWith("lock");
});
