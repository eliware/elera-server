export function isEvidenceFqdn(value) {
  return (
    typeof value === "string" &&
    value.includes(".") &&
    value.split(".").every((label) => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label))
  );
}
