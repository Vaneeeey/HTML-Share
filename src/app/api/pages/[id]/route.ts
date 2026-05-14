import fs from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { hashAccessPassword } from "@/lib/access";
import { isAdminRequest, unauthorized } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { pageUploadDir } from "@/lib/paths";
import { serializeComment, serializePage } from "@/lib/serializers";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return unauthorized();
  const { id } = await context.params;

  const page = await prisma.page.findUnique({
    where: { id },
    include: {
      comments: {
        include: { replies: { orderBy: { createdAt: "asc" } } },
        orderBy: { createdAt: "asc" },
      },
      _count: { select: { comments: true } },
    },
  });

  if (!page) return NextResponse.json({ error: "Page not found." }, { status: 404 });

  return NextResponse.json({
    page: serializePage(page),
    comments: page.comments.map((comment) => serializeComment(comment, { isAdmin: true })),
  });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return unauthorized();
  const { id } = await context.params;

  const page = await prisma.page.findUnique({ where: { id } });
  if (!page) return NextResponse.json({ error: "Page not found." }, { status: 404 });

  await prisma.page.delete({ where: { id } });
  await fs.rm(pageUploadDir(id), { recursive: true, force: true });

  return NextResponse.json({ ok: true });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return unauthorized();
  const { id } = await context.params;
  const input = (await request.json().catch(() => ({}))) as { accessPassword?: unknown };

  try {
    const existingPage = await prisma.page.findUnique({ where: { id }, select: { id: true } });
    if (!existingPage) return NextResponse.json({ error: "Page not found." }, { status: 404 });

    const page = await prisma.page.update({
      where: { id },
      data: { accessPasswordHash: hashAccessPassword(input.accessPassword) },
      include: {
        comments: {
          include: { replies: { orderBy: { createdAt: "asc" } } },
          orderBy: { createdAt: "asc" },
        },
        _count: { select: { comments: true } },
      },
    });

    return NextResponse.json({
      page: serializePage(page),
      comments: page.comments.map((comment) => serializeComment(comment, { isAdmin: true })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Access password update failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
