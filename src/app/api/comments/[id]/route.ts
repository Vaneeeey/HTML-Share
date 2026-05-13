import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest, unauthorized } from "@/lib/auth";
import { normalizeStatus } from "@/lib/comments";
import { prisma } from "@/lib/prisma";
import { serializeComment } from "@/lib/serializers";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return unauthorized();
  const { id } = await context.params;
  const input = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  try {
    const comment = await prisma.comment.update({
      where: { id },
      data: { status: normalizeStatus(input.status) },
    });
    return NextResponse.json({ comment: serializeComment(comment) });
  } catch {
    return NextResponse.json({ error: "Comment not found." }, { status: 404 });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return unauthorized();
  const { id } = await context.params;

  try {
    await prisma.comment.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Comment not found." }, { status: 404 });
  }
}
