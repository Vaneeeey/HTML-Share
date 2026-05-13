import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  adminCookieName,
  adminCookieOptions,
  createAdminToken,
  getIdentityFromRequest,
} from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const { password } = (await request.json().catch(() => ({}))) as { password?: string };
  const expected = process.env.ADMIN_PASSWORD;

  if (!expected) {
    return NextResponse.json({ error: "ADMIN_PASSWORD is not configured." }, { status: 500 });
  }

  const actualBuffer = Buffer.from(password ?? "");
  const expectedBuffer = Buffer.from(expected);
  const valid =
    actualBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(actualBuffer, expectedBuffer);

  if (!valid) {
    return NextResponse.json({ error: "Invalid password." }, { status: 401 });
  }

  const identity = getIdentityFromRequest(request);
  const response = NextResponse.json({ ok: true, hasIdentity: Boolean(identity) });
  response.cookies.set(adminCookieName, createAdminToken(), adminCookieOptions());
  return response;
}
