import { inspectDataDirectory } from "./directory.mjs";
import { pathToFileURL } from "node:url";

export function runDataDirectoryCli(
  [directory, bootstrapValue] = process.argv.slice(2),
  inspect = inspectDataDirectory,
  output = console.log,
  logError = console.error,
) {
  if (!directory) throw new Error("data directory is required");
  const result = inspect(directory, { bootstrap: bootstrapValue === "true" });
  if (result.action === "fail") {
    logError(result.message);
    output("fail");
  } else output(result.action);
  return result.action;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  runDataDirectoryCli();
