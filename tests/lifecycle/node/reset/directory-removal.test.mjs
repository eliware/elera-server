import { expect, jest, test } from "@jest/globals";
import { installMemoryFileSystem } from "../../../../test-fixtures/memory-filesystem.mjs";

const memoryFs = installMemoryFileSystem(jest);
jest.unstable_mockModule("node:fs/promises", () => memoryFs);
const { mkdir, mkdtemp, readdir, rm, writeFile } = memoryFs;
const { removeNodeDataDirectory } =
  await import("../../../../src/lifecycle/node/reset/directory-removal.mjs");

test("removes every entry from the node data directory recursively", async () => {
  const directory = await mkdtemp("/reset-test-");
  await mkdir(`${directory}/mysql`);
  await writeFile(`${directory}/mysql/state`, "x");

  await removeNodeDataDirectory(directory);

  await expect(readdir(directory)).resolves.toEqual([]);
  await rm(directory, { recursive: true, force: true });
});
