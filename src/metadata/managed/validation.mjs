import { createHash, randomBytes } from "node:crypto";

export const validName = (value, label) => {
  if (typeof value !== "string" || !/^[A-Za-z][A-Za-z0-9_-]{0,62}$/.test(value))
    throw Object.assign(new Error(`${label} is invalid`), { statusCode: 400 });
  return value;
};

export const validFqdn = (value, label) => {
  if (
    typeof value !== "string" ||
    value.length > 253 ||
    !value.includes(".") ||
    !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(value)
  )
    throw Object.assign(new Error(`${label} must be a valid hostname`), {
      statusCode: 400,
    });
  return value;
};

export const hashToken = (value) => createHash("sha256").update(value).digest("hex");
export const createPassword = () => randomBytes(24).toString("base64url");
export const createToken = () => randomBytes(32).toString("base64url");
