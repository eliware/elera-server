import { spawn } from "node:child_process";

export function runSupervisor(command, args = [], spawnImpl = spawn) {
  return new Promise((resolve) => {
    const child = spawnImpl(command, args, { stdio: "inherit" });
    child.once("error", () => resolve({ code: 1 }));
    child.once("exit", (code) => resolve({ code: code ?? 1 }));
  });
}
