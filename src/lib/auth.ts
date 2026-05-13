import crypto from "node:crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const adminCookieName = "html_share_admin";
const maxAgeSeconds = 60 * 60 * 24 * 14;

function getSecret() {
  const secret = process.env.APP_SECRET;
  if (!secret) {
    throw new Error("APP_SECRET is required");
  }
  return secret;
}

function sign(payload: string) {
  return crypto.createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

export function createAdminToken() {
  const expiresAt = Date.now() + maxAgeSeconds * 1000;
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

export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function adminCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: maxAgeSeconds,
    path: "/",
  };
}
