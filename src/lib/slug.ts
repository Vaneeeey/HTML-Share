import crypto from "node:crypto";

export function newId() {
  return crypto.randomUUID();
}

export function newSlug() {
  return crypto.randomBytes(9).toString("base64url");
}
