import { expect as __fixture7_expect, test as __fixture7_test, jest } from "@jest/globals";
import { join } from "node:path";
import { expect, test } from "@jest/globals";
import { installMemoryFileSystem } from "../../test-fixtures/memory-filesystem.mjs";

const __memoryFs = installMemoryFileSystem(jest);
jest.unstable_mockModule("node:fs/promises", () => __memoryFs);
jest.unstable_mockModule("node:fs", () => __memoryFs);
jest.unstable_mockModule("node:os", () => ({ tmpdir: () => "/tmp" }));
const { readFile: __fixture7_readFile } = __memoryFs;
const { mkdtemp, mkdir, rm } = __memoryFs;
const tmpdir = () => "/tmp";
const { runNode, startMariaDbEntrypoint } = await import("../../src/docker/mariadb-entrypoint.mjs");

const base = (overrides = {}) => ({
  environment: { MARIADB_DATA_DIR: "/data" },
  exists: jest.fn().mockResolvedValue(false),
  readDirectory: jest.fn().mockResolvedValue([]),
  write: jest.fn(),
  startPending: jest.fn(),
  initialize: jest.fn(),
  runNode: jest.fn().mockResolvedValue("start"),
  runSupervisor: jest.fn().mockResolvedValue({ code: 0 }),
  exit: jest.fn(),
  logError: jest.fn(),
  ...overrides,
});

test("starts pending initialization for an empty data directory", async () => {
  const options = base();
  await startMariaDbEntrypoint(options);
  expect(options.startPending).toHaveBeenCalledTimes(1);
  expect(options.runSupervisor).not.toHaveBeenCalled();
});

test("rejects a non-empty directory without a MariaDB system database", async () => {
  const options = base({ readDirectory: jest.fn().mockResolvedValue(["lost+found"]) });
  await startMariaDbEntrypoint(options);
  expect(options.logError).toHaveBeenCalledWith(
    "pending initialization requires an empty data directory",
  );
  expect(options.exit).toHaveBeenCalledWith(1);
});

test("initializes an approved data directory before supervisor startup", async () => {
  const options = base({
    exists: jest.fn().mockResolvedValue(true),
    runNode: jest.fn().mockResolvedValue("initialize"),
  });
  await startMariaDbEntrypoint(options);
  expect(options.initialize).toHaveBeenCalledWith({
    environment: { MARIADB_DATA_DIR: "/data" },
    log: console,
  });
  expect(options.write).toHaveBeenCalledWith("/data/.elera-supervisor-initialized", "");
  expect(options.runSupervisor).toHaveBeenCalledWith("node", ["/app/src/main.mjs"]);
});

test("stops when the data-directory check fails", async () => {
  const options = base({
    exists: jest.fn().mockResolvedValue(true),
    runNode: jest.fn().mockResolvedValue("fail"),
  });
  await startMariaDbEntrypoint(options);
  expect(options.logError).toHaveBeenCalledWith("MariaDB data-directory validation failed");
  expect(options.exit).toHaveBeenCalledWith(1);
  expect(options.runSupervisor).not.toHaveBeenCalled();
});

test("exits with the supervisor result code", async () => {
  const options = base({
    exists: jest.fn().mockResolvedValue(true),
    runSupervisor: jest.fn().mockResolvedValue({ code: 3 }),
  });
  await startMariaDbEntrypoint(options);
  expect(options.exit).toHaveBeenCalledWith(3);
});

test("reads the real data directory and starts when MariaDB exists", async () => {
  const directory = await mkdtemp(join(tmpdir(), "elera-entrypoint-"));
  await mkdir(join(directory, "mysql"));
  const runSupervisor = jest.fn().mockResolvedValue({ code: 0 });
  try {
    await startMariaDbEntrypoint({
      environment: { MARIADB_DATA_DIR: directory },
      runNode: async () => "start",
      runSupervisor,
    });
    expect(runSupervisor).toHaveBeenCalledTimes(1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("runs a child process and captures its output", async () => {
  await expect(runNode("-e", "process.stdout.write('ready')")).resolves.toBe("ready");
});

test("reports child process failure", async () => {
  await expect(runNode("missing-file.mjs")).rejects.toThrow("exited with");
});
