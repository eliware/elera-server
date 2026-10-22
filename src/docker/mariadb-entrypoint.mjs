import { spawn } from "node:child_process";
import { access, readdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { startPendingInitRuntime } from "../lifecycle/pending-init/runtime.mjs";
import { initializePendingData } from "../lifecycle/pending-init/initialize.mjs";
import { runSupervisor } from "./run-supervisor.mjs";

export async function startMariaDbEntrypoint(options) {
  const {
    environment,
    exists,
    readDirectory,
    write,
    startPending,
    initialize,
    runNode: run,
    runSupervisor: supervise,
    exit,
    logError,
  } = resolveEntrypointOptions(options);
  const datadir = environment.MARIADB_DATA_DIR ?? "/var/lib/mysql";
  if (!(await exists(`${datadir}/mysql`))) {
    const entries = await readDirectory(datadir);
    if (entries.length === 0) {
      startPending();
      return;
    }
    return exit(fail("pending initialization requires an empty data directory", logError));
  }
  const action = await run("/app/src/lifecycle/data-directory-cli.mjs", datadir, "false");
  if (action === "initialize")
    await initialize({ environment: { ...environment, MARIADB_DATA_DIR: datadir }, log: console });
  if (action === "fail") return exit(fail("MariaDB data-directory validation failed", logError));
  if (action === "initialize") await write(`${datadir}/.elera-supervisor-initialized`, "");
  const result = await supervise("node", ["/app/src/main.mjs"]);
  if (result.code !== 0) return exit(result.code);
}

export function resolveEntrypointOptions(options = {}) {
  return {
    environment: process.env,
    exists: pathExists,
    readDirectory: readdir,
    write: writeFile,
    startPending: startPendingInitRuntime,
    initialize: initializePendingData,
    runNode,
    runSupervisor,
    exit: process.exit,
    logError: console.error,
    ...options,
  };
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
export function runNode(file, ...args) {
  return new Promise((resolve, reject) => {
    const child = spawn("node", [file, ...args], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    child.stdout.on("data", (data) => (out += data));
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0 ? resolve(out.trim()) : reject(new Error(`node ${file} exited with ${code}`)),
    );
  });
}
function fail(message, logError) {
  logError(message);
  return 1;
}

export async function runIfEntrypoint(moduleUrl, scriptPath, start = startMariaDbEntrypoint) {
  if (scriptPath && moduleUrl === pathToFileURL(scriptPath).href) await start();
}

await runIfEntrypoint(import.meta.url, process.argv[1]);
