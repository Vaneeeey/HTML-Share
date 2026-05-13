import { NextRequest, NextResponse } from "next/server";
import {
  createShareAccessToken,
  shareAccessCookieName,
  shareAccessCookieOptions,
  verifyAccessPassword,
} from "@/lib/access";
import { getIdentityFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const identity = getIdentityFromRequest(request);
  if (!identity) {
    return NextResponse.json({ error: "Name is required before entering access password." }, { status: 401 });
  }

  const { slug } = await context.params;
  const page = await prisma.page.findUnique({ where: { slug } });
  if (!page) return NextResponse.json({ error: "Page not found." }, { status: 404 });
  if (!page.accessPasswordHash) {
    return NextResponse.json({ error: "Access password is not configured." }, { status: 403 });
  }

  const input = (await request.json().catch(() => ({}))) as { password?: unknown };
  if (!verifyAccessPassword(input.password, page.accessPasswordHash)) {
    return NextResponse.json({ error: "Invalid access password." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(
    shareAccessCookieName(page.id),
    createShareAccessToken(page),
    shareAccessCookieOptions(),
  );
  return response;
}
