import { NextRequest, NextResponse } from "next/server";
import { assertBodyInput } from "@/lib/comments";
import { prisma } from "@/lib/prisma";
import { getCommentActor } from "@/lib/share-auth";
import { newId } from "@/lib/slug";
import { serializeReply } from "@/lib/serializers";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; slug: string }> },
) {
  const { id, slug } = await context.params;
  const page = await prisma.page.findUnique({ where: { slug } });
  if (!page) return NextResponse.json({ error: "Page not found." }, { status: 404 });

  const actor = getCommentActor(request, page);
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  if (!actor.identityId) return NextResponse.json({ error: "Name is required." }, { status: 401 });

  const comment = await prisma.comment.findFirst({ where: { id, pageId: page.id } });
  if (!comment) return NextResponse.json({ error: "Comment not found." }, { status: 404 });

  try {
    const input = assertBodyInput((await request.json()) as Record<string, unknown>);
    const reply = await prisma.commentReply.create({
      data: {
        id: newId(),
        authorIdentityId: actor.identityId,
        authorName: actor.name,
        body: input.body,
        commentId: comment.id,
      },
    });
    return NextResponse.json({ reply: serializeReply(reply, actor) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid reply.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
