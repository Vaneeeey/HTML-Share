import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import type { Page } from "@prisma/client";

export const shareAccessMaxAgeSeconds = 60 * 60 * 24 * 90;

function getSecret() {
  const secret = process.env.APP_SECRET;
  if (!secret) {
    throw new Error("APP_SECRET is required");
  }
  return secret;
}

export function normalizeAccessPassword(value: unknown) {
  const password = String(value ?? "").trim();
  if (!password) throw new Error("Access password is required.");
  if (password.length < 4) throw new Error("Access password must be at least 4 characters.");
  if (password.length > 128) throw new Error("Access password is too long.");
  return password;
}

export function hashAccessPassword(value: unknown) {
  const password = normalizeAccessPassword(value);
  const salt = crypto.randomBytes(16).toString("base64url");
  const iterations = 120_000;
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 32, "sha256").toString("base64url");
  return `pbkdf2_sha256$${iterations}$${salt}$${hash}`;
}

export function verifyAccessPassword(value: unknown, storedHash: string | null) {
  if (!storedHash) return false;
  const password = String(value ?? "").trim();
  const [algorithm, iterationsRaw, salt, expected] = storedHash.split("$");
  const iterations = Number(iterationsRaw);

  if (algorithm !== "pbkdf2_sha256" || !iterations || !salt || !expected) return false;

  const actual = crypto.pbkdf2Sync(password, salt, iterations, 32, "sha256").toString("base64url");
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

export function shareAccessCookieName(pageId: string) {
  return `html_share_access_v2_${pageId}`;
}

function signAccessPayload(payload: string, accessPasswordHash: string) {
  return crypto
    .createHmac("sha256", getSecret())
    .update(`${payload}.${accessPasswordHash}`)
    .digest("base64url");
}

export function createShareAccessToken(page: Pick<Page, "id" | "accessPasswordHash">) {
  if (!page.accessPasswordHash) {
    throw new Error("Page access password is not configured.");
  }

  const expiresAt = Date.now() + shareAccessMaxAgeSeconds * 1000;
  const payload = `${page.id}.${expiresAt}`;
  return `${payload}.${signAccessPayload(payload, page.accessPasswordHash)}`;
}

export function verifyShareAccessToken(
  page: Pick<Page, "id" | "accessPasswordHash">,
  token?: string,
) {
  if (!token || !page.accessPasswordHash) return false;

  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== page.id) return false;

  const payload = `${parts[0]}.${parts[1]}`;
  const expected = signAccessPayload(payload, page.accessPasswordHash);
  const actual = parts[2];
  if (expected.length !== actual.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual))) return false;

  return Number(parts[1]) > Date.now();
}

export function isShareAccessRequest(request: NextRequest, page: Pick<Page, "id" | "accessPasswordHash">) {
  return verifyShareAccessToken(page, request.cookies.get(shareAccessCookieName(page.id))?.value);
}

export function shareAccessCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: shareAccessMaxAgeSeconds,
    path: "/",
  };
}
