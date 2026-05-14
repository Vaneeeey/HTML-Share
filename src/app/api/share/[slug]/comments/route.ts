import { NextRequest, NextResponse } from "next/server";
import { getIdentityFromRequest, isAdminRequest } from "@/lib/auth";
import { assertCommentInput } from "@/lib/comments";
import { prisma } from "@/lib/prisma";
import { getCommentActor } from "@/lib/share-auth";
import { newId } from "@/lib/slug";
import { serializeComment } from "@/lib/serializers";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  if (!isAdminRequest(request) && !getIdentityFromRequest(request)) {
    return NextResponse.json({ error: "Name is required." }, { status: 401 });
  }

  const { slug } = await context.params;
  const page = await prisma.page.findUnique({
    where: { slug },
    include: {
      comments: {
        include: { replies: { orderBy: { createdAt: "asc" } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!page) return NextResponse.json({ error: "Page not found." }, { status: 404 });
  const actor = getCommentActor(request, page);
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });

  return NextResponse.json({
    comments: page.comments.map((comment) => serializeComment(comment, actor)),
  });
}

export async function POST(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  if (!isAdminRequest(request) && !getIdentityFromRequest(request)) {
    return NextResponse.json({ error: "Name is required." }, { status: 401 });
  }

  const { slug } = await context.params;
  const page = await prisma.page.findUnique({ where: { slug } });

  if (!page) return NextResponse.json({ error: "Page not found." }, { status: 404 });
  const actor = getCommentActor(request, page);
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  if (!actor.identityId) return NextResponse.json({ error: "Name is required." }, { status: 401 });

  try {
    const input = assertCommentInput((await request.json()) as Record<string, unknown>);
    const comment = await prisma.comment.create({
      data: {
        id: newId(),
        pageId: page.id,
        authorIdentityId: actor.identityId,
        authorName: actor.name,
        ...input,
      },
      include: { replies: { orderBy: { createdAt: "asc" } } },
    });

    return NextResponse.json({ comment: serializeComment(comment, actor) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid comment.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
