import { startPendingInitRuntime } from "./pending-init/runtime.mjs";
import { pathToFileURL } from "node:url";

export function runPendingInitCli(start = startPendingInitRuntime) {
  return start();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runPendingInitCli();
