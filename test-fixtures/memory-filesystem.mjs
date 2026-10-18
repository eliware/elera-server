import { normalize } from "node:path";

export function createMemoryFileSystem() {
  const files = new Map();
  const directories = new Set(["/", "/tmp"]);
  let nextDirectory = 0;
  const pathOf = (value) =>
    normalize(String(value).replaceAll("\\", "/"))
      .replaceAll("\\", "/")
      .replace(/^[A-Za-z]:/, "");
  const parentOf = (value) => {
    const path = pathOf(value);
    const index = path.lastIndexOf("/");
    return index <= 0 ? "/" : path.slice(0, index);
  };
  const error = (code, path) => Object.assign(new Error(`${code}: ${path}`), { code });
  const ensureDirectory = (value, recursive = false) => {
    const path = pathOf(value);
    if (directories.has(path)) return;
    if (files.has(path)) throw error("EEXIST", path);
    const parent = parentOf(path);
    if (!directories.has(parent)) {
      if (!recursive) throw error("ENOENT", parent);
      ensureDirectory(parent, true);
    }
    directories.add(path);
  };
  const read = (value, encoding) => {
    const path = pathOf(value);
    if (directories.has(path)) throw error("EISDIR", path);
    if (!files.has(path)) throw error("ENOENT", path);
    const data = files.get(path);
    return encoding ? data.toString(encoding) : Buffer.from(data);
  };
  const write = (value, data, options = {}) => {
    const path = pathOf(value);
    if (directories.has(path)) throw error("EISDIR", path);
    if (!directories.has(parentOf(path))) throw error("ENOENT", parentOf(path));
    const encoding = typeof options === "string" ? options : options.encoding;
    files.set(
      path,
      Object.assign(
        Buffer.isBuffer(data) ? Buffer.from(data) : Buffer.from(String(data), encoding),
        { mtimeMs: Date.now() },
      ),
    );
  };
  const remove = (value, options = {}) => {
    const path = pathOf(value);
    if (files.delete(path)) return;
    if (!directories.has(path)) {
      if (!options.force) throw error("ENOENT", path);
      return;
    }
    const descendants = [...files.keys(), ...directories].filter((item) =>
      item.startsWith(`${path}/`),
    );
    if (descendants.length && !options.recursive) throw error("ENOTEMPTY", path);
    for (const item of descendants) {
      files.delete(item);
      directories.delete(item);
    }
    if (path !== "/" && path !== "/tmp") directories.delete(path);
  };
  const stat = (value) => {
    const path = pathOf(value);
    if (!files.has(path) && !directories.has(path)) throw error("ENOENT", path);
    const isDirectory = directories.has(path);
    return {
      isDirectory: () => isDirectory,
      isFile: () => !isDirectory,
      mtimeMs: files.get(path)?.mtimeMs ?? 0,
      mode: 0o777,
    };
  };
  const entries = (value, options = {}) => {
    const path = pathOf(value);
    if (!directories.has(path)) throw error("ENOENT", path);
    const names = new Set();
    for (const item of [...files.keys(), ...directories]) {
      if (parentOf(item) === path) names.add(item.slice(path.length + 1));
    }
    return [...names].map((name) => {
      const itemPath = `${path}/${name}`;
      if (!options.withFileTypes) return name;
      return {
        name,
        isDirectory: () => directories.has(itemPath),
        isFile: () => files.has(itemPath),
      };
    });
  };
  const mkdirSync = (path, options) => ensureDirectory(path, options?.recursive);
  const mkdtempSync = (prefix) => {
    const path = `${pathOf(prefix)}${nextDirectory++}`;
    ensureDirectory(path, true);
    return path;
  };
  const writeFileSync = (path, data, options) => write(path, data, options);
  const readFileSync = (path, options) => read(path, options);
  const renameSync = (from, to) => {
    const source = pathOf(from);
    const destination = pathOf(to);
    if (directories.has(destination)) throw error("EISDIR", destination);
    if (!files.has(source)) throw error("ENOENT", source);
    if (!directories.has(parentOf(destination))) throw error("ENOENT", parentOf(destination));
    files.set(destination, files.get(source));
    files.delete(source);
  };
  const rmSync = (path, options) => remove(path, options);
  const fs = {
    open: async (path, flags) => {
      if (flags !== "wx") throw new Error(`unsupported open flags: ${flags}`);
      const key = pathOf(path);
      if (key.includes("\0")) throw error("EINVAL", key);
      if (files.has(key) || directories.has(key)) throw error("EEXIST", key);
      write(key, "");
      return {
        writeFile: async (data) => write(key, data),
        close: async () => {},
      };
    },
    mkdir: async (path, options) => mkdirSync(path, options),
    mkdtemp: async (prefix) => mkdtempSync(prefix),
    readFile: async (path, options) => read(path, options),
    writeFile: async (path, data, options) => write(path, data, options),
    rename: async (from, to) => renameSync(from, to),
    unlink: async (path) => {
      if (!files.delete(pathOf(path))) throw error("ENOENT", path);
    },
    rm: async (path, options) => remove(path, options),
    stat: async (path) => stat(path),
    lstat: async (path) => stat(path),
    readdir: async (path, options) => entries(path, options),
    access: async (path) => stat(path),
    utimes: async (path, _atime, mtime) => {
      const key = pathOf(path);
      if (!files.has(key)) throw error("ENOENT", key);
      files.get(key).mtimeMs = Number(mtime) || 0;
    },
    mkdirSync,
    mkdtempSync,
    readFileSync,
    writeFileSync,
    renameSync,
    rmSync,
    unlinkSync: (path) => {
      if (!files.delete(pathOf(path))) throw error("ENOENT", path);
    },
    statSync: stat,
    lstatSync: stat,
    readdirSync: entries,
    existsSync: (path) => files.has(pathOf(path)) || directories.has(pathOf(path)),
    accessSync: (path) => stat(path),
    constants: { R_OK: 4, W_OK: 2, X_OK: 1, F_OK: 0 },
  };
  fs.default = fs;
  return fs;
}

export function installMemoryFileSystem(jest) {
  const fs = createMemoryFileSystem();
  jest.unstable_mockModule("node:fs/promises", () => fs);
  jest.unstable_mockModule("node:fs", () => fs);
  jest.unstable_mockModule("node:os", () => ({ tmpdir: () => "/tmp" }));
  return fs;
}
