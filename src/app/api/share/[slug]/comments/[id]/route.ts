import { NextRequest, NextResponse } from "next/server";
import { assertBodyInput } from "@/lib/comments";
import { prisma } from "@/lib/prisma";
import { actorCanDelete, actorCanEdit, getCommentActor } from "@/lib/share-auth";
import { serializeComment } from "@/lib/serializers";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; slug: string }> },
) {
  const { id, slug } = await context.params;
  const page = await prisma.page.findUnique({ where: { slug } });
  if (!page) return NextResponse.json({ error: "Page not found." }, { status: 404 });

  const actor = getCommentActor(request, page);
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });

  const comment = await prisma.comment.findFirst({
    where: { id, pageId: page.id },
    include: { replies: { orderBy: { createdAt: "asc" } } },
  });
  if (!comment) return NextResponse.json({ error: "Comment not found." }, { status: 404 });
  if (!actorCanEdit(actor, comment.authorIdentityId)) {
    return NextResponse.json({ error: "Only the comment author can edit this comment." }, { status: 403 });
  }

  try {
    const input = assertBodyInput((await request.json()) as Record<string, unknown>);
    const updated = await prisma.comment.update({
      where: { id: comment.id },
      data: { body: input.body },
      include: { replies: { orderBy: { createdAt: "asc" } } },
    });
    return NextResponse.json({ comment: serializeComment(updated, actor) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid comment.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; slug: string }> },
) {
  const { id, slug } = await context.params;
  const page = await prisma.page.findUnique({ where: { slug } });
  if (!page) return NextResponse.json({ error: "Page not found." }, { status: 404 });

  const actor = getCommentActor(request, page);
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });

  const comment = await prisma.comment.findFirst({ where: { id, pageId: page.id } });
  if (!comment) return NextResponse.json({ error: "Comment not found." }, { status: 404 });
  if (!actorCanDelete(actor, comment.authorIdentityId)) {
    return NextResponse.json({ error: "Only the comment author can delete this comment." }, { status: 403 });
  }

  await prisma.comment.delete({ where: { id: comment.id } });
  return NextResponse.json({ ok: true });
}
