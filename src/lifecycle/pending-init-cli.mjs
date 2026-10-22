import { startPendingInitRuntime } from "./pending-init/runtime.mjs";
import { pathToFileURL } from "node:url";

export function runPendingInitCli(start) {
  return start();
}

export function runPendingInitCliIfMain(moduleUrl, scriptPath, start) {
  if (scriptPath && moduleUrl === pathToFileURL(scriptPath).href) return runPendingInitCli(start);
}

runPendingInitCliIfMain(import.meta.url, process.argv[1], startPendingInitRuntime);
