import { EventEmitter } from "node:events";
import { expect, jest, test } from "@jest/globals";
import { runSupervisor } from "../../src/docker/run-supervisor.mjs";

const runWith = (event, value) => {
  const child = new EventEmitter();
  const spawn = jest.fn(() => {
    queueMicrotask(() => child.emit(event, value));
    return child;
  });
  return { child, spawn };
};

test("inherits supervisor input and output and returns its exit code", async () => {
  const { spawn } = runWith("exit", 0);
  await expect(runSupervisor("node", ["main.mjs"], spawn)).resolves.toEqual({ code: 0 });
  expect(spawn).toHaveBeenCalledWith("node", ["main.mjs"], { stdio: "inherit" });
});

test("returns failure when the supervisor process cannot start", async () => {
  const { spawn } = runWith("error", new Error("spawn failed"));
  await expect(runSupervisor("missing", [], spawn)).resolves.toEqual({ code: 1 });
});

test("uses failure when the process exits without a code", async () => {
  const { spawn } = runWith("exit", null);
  await expect(runSupervisor("node", [], spawn)).resolves.toEqual({ code: 1 });
});
