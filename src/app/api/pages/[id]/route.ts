import fs from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
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
      comments: { orderBy: { createdAt: "asc" } },
      _count: { select: { comments: true } },
    },
  });

  if (!page) return NextResponse.json({ error: "Page not found." }, { status: 404 });

  return NextResponse.json({
    page: serializePage(page),
    comments: page.comments.map(serializeComment),
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
