import { mkdir, open, unlink } from "node:fs/promises";
import { dirname } from "node:path";

export function createOperationLock({
  path,
  makeDirectory = mkdir,
  openFile = open,
  remove = unlink,
} = {}) {
  if (!path)
    return {
      async run(operation) {
        return operation();
      },
    };
  return {
    async run(operation) {
      let handle;
      try {
        await makeDirectory(dirname(path), { recursive: true });
        handle = await openFile(path, "wx");
        await handle.writeFile(
          JSON.stringify({ operation: "cold-bootstrap", createdAt: new Date().toISOString() }),
        );
      } catch (error) {
        if (handle) {
          await handle.close().catch(() => {});
          await remove(path).catch(() => {});
        }
        if (error.code === "EEXIST") {
          throw Object.assign(
            new Error("cold bootstrap lock exists and requires operator review"),
            {
              statusCode: 409,
            },
          );
        }
        throw error;
      }
      try {
        return await operation();
      } finally {
        await handle?.close().catch(() => {});
        await remove(path).catch(() => {});
      }
    },
  };
}
