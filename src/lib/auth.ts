import crypto from "node:crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const adminCookieName = "html_share_admin";
export const identityCookieName = "html_share_identity";
const adminMaxAgeSeconds = 60 * 60 * 24 * 14;
export const identityMaxAgeSeconds = 60 * 60 * 24 * 90;

function getSecret() {
  const secret = process.env.APP_SECRET;
  if (!secret) {
    throw new Error("APP_SECRET is required");
  }
  return secret;
}

function getAdminPassword() {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    throw new Error("ADMIN_PASSWORD is required");
  }
  return password;
}

function getSigningKey() {
  return crypto.createHmac("sha256", getSecret()).update(getAdminPassword()).digest();
}

function sign(payload: string) {
  return crypto.createHmac("sha256", getSigningKey()).update(payload).digest("base64url");
}

export function createAdminToken() {
  const expiresAt = Date.now() + adminMaxAgeSeconds * 1000;
  const payload = `admin.${expiresAt}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyAdminToken(token?: string) {
  if (!token) return false;

  const parts = token.split(".");
  if (parts.length !== 3) return false;

  const payload = `${parts[0]}.${parts[1]}`;
  const expected = sign(payload);
  const actual = parts[2];

  if (expected.length !== actual.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual))) {
    return false;
  }

  return Number(parts[1]) > Date.now();
}

export async function isAdminFromCookies() {
  const cookieStore = await cookies();
  return verifyAdminToken(cookieStore.get(adminCookieName)?.value);
}

export function isAdminRequest(request: NextRequest) {
  return verifyAdminToken(request.cookies.get(adminCookieName)?.value);
}

function signIdentityPayload(payload: string) {
  return crypto.createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

export function normalizeIdentityName(value: unknown) {
  const name = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!name) throw new Error("Name is required.");
  if (name.length > 80) throw new Error("Name is too long.");
  return name;
}

export function createIdentityToken(name: string) {
  const payload = Buffer.from(
    JSON.stringify({
      name: normalizeIdentityName(name),
      expiresAt: Date.now() + identityMaxAgeSeconds * 1000,
    }),
  ).toString("base64url");
  return `${payload}.${signIdentityPayload(payload)}`;
}

export function verifyIdentityToken(token?: string) {
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payload, actual] = parts;
  const expected = signIdentityPayload(payload);
  if (expected.length !== actual.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual))) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      name?: unknown;
      expiresAt?: unknown;
    };
    if (typeof data.expiresAt !== "number" || data.expiresAt <= Date.now()) return null;
    return { name: normalizeIdentityName(data.name) };
  } catch {
    return null;
  }
}

export async function getIdentityFromCookies() {
  const cookieStore = await cookies();
  return verifyIdentityToken(cookieStore.get(identityCookieName)?.value);
}

export function getIdentityFromRequest(request: NextRequest) {
  return verifyIdentityToken(request.cookies.get(identityCookieName)?.value);
}

export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function adminCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: adminMaxAgeSeconds,
    path: "/",
  };
}

export function identityCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: identityMaxAgeSeconds,
    path: "/",
  };
}
