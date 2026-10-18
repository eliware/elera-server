export function toBundleVersion(version, fallback = 1) {
  if (Number.isSafeInteger(version) && version >= 0) return version;
  if (typeof version !== "string" || !/^[a-f\d]{16}$/i.test(version)) return fallback;
  return Number.parseInt(version.slice(0, 12), 16);
}
