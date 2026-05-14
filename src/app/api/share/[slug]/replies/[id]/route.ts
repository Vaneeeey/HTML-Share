import { NextRequest, NextResponse } from "next/server";
import { assertBodyInput } from "@/lib/comments";
import { prisma } from "@/lib/prisma";
import { actorCanDelete, actorCanEdit, getCommentActor } from "@/lib/share-auth";
import { serializeReply } from "@/lib/serializers";

export const runtime = "nodejs";

async function findPageAndReply(slug: string, id: string) {
  const page = await prisma.page.findUnique({ where: { slug } });
  if (!page) return { page: null, reply: null };

  const reply = await prisma.commentReply.findFirst({
    where: { id, comment: { pageId: page.id } },
  });

  return { page, reply };
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; slug: string }> },
) {
  const { id, slug } = await context.params;
  const { page, reply } = await findPageAndReply(slug, id);
  if (!page) return NextResponse.json({ error: "Page not found." }, { status: 404 });

  const actor = getCommentActor(request, page);
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  if (!reply) return NextResponse.json({ error: "Reply not found." }, { status: 404 });
  if (!actorCanEdit(actor, reply.authorIdentityId)) {
    return NextResponse.json({ error: "Only the reply author can edit this reply." }, { status: 403 });
  }

  try {
    const input = assertBodyInput((await request.json()) as Record<string, unknown>);
    const updated = await prisma.commentReply.update({
      where: { id: reply.id },
      data: { body: input.body },
    });
    return NextResponse.json({ reply: serializeReply(updated, actor) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid reply.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; slug: string }> },
) {
  const { id, slug } = await context.params;
  const { page, reply } = await findPageAndReply(slug, id);
  if (!page) return NextResponse.json({ error: "Page not found." }, { status: 404 });

  const actor = getCommentActor(request, page);
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  if (!reply) return NextResponse.json({ error: "Reply not found." }, { status: 404 });
  if (!actorCanDelete(actor, reply.authorIdentityId)) {
    return NextResponse.json({ error: "Only the reply author can delete this reply." }, { status: 403 });
  }

  await prisma.commentReply.delete({ where: { id: reply.id } });
  return NextResponse.json({ ok: true });
}
