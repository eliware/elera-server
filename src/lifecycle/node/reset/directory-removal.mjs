import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";

export async function removeNodeDataDirectory(directory) {
  for (const entry of await readdir(directory))
    await rm(join(directory, entry), { recursive: true, force: true });
}
