import { NextRequest, NextResponse } from "next/server";
import { assertCommentInput } from "@/lib/comments";
import { prisma } from "@/lib/prisma";
import { newId } from "@/lib/slug";
import { serializeComment } from "@/lib/serializers";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const page = await prisma.page.findUnique({
    where: { slug },
    include: { comments: { orderBy: { createdAt: "asc" } } },
  });

  if (!page) return NextResponse.json({ error: "Page not found." }, { status: 404 });

  return NextResponse.json({ comments: page.comments.map(serializeComment) });
}

export async function POST(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const page = await prisma.page.findUnique({ where: { slug } });

  if (!page) return NextResponse.json({ error: "Page not found." }, { status: 404 });

  try {
    const input = assertCommentInput((await request.json()) as Record<string, unknown>);
    const comment = await prisma.comment.create({
      data: {
        id: newId(),
        pageId: page.id,
        ...input,
      },
    });

    return NextResponse.json({ comment: serializeComment(comment) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid comment.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
