import { NextRequest, NextResponse } from "next/server";
import {
  createIdentityToken,
  identityCookieName,
  identityCookieOptions,
  normalizeIdentityName,
} from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const input = (await request.json().catch(() => ({}))) as { name?: unknown };
    const name = normalizeIdentityName(input.name);
    const response = NextResponse.json({ ok: true, name });
    response.cookies.set(identityCookieName, createIdentityToken(name), identityCookieOptions());
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid name.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
