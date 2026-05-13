import { NextRequest, NextResponse } from "next/server";
import { isShareAccessRequest } from "@/lib/access";
import { getIdentityFromRequest } from "@/lib/auth";
import { assertCommentInput } from "@/lib/comments";
import { prisma } from "@/lib/prisma";
import { newId } from "@/lib/slug";
import { serializeComment } from "@/lib/serializers";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const identity = getIdentityFromRequest(request);
  if (!identity) return NextResponse.json({ error: "Name is required." }, { status: 401 });

  const { slug } = await context.params;
  const page = await prisma.page.findUnique({
    where: { slug },
    include: { comments: { orderBy: { createdAt: "asc" } } },
  });

  if (!page) return NextResponse.json({ error: "Page not found." }, { status: 404 });
  if (!page.accessPasswordHash) {
    return NextResponse.json({ error: "Access password is not configured." }, { status: 403 });
  }
  if (!isShareAccessRequest(request, page)) {
    return NextResponse.json({ error: "Access password is required." }, { status: 403 });
  }

  return NextResponse.json({ comments: page.comments.map(serializeComment) });
}

export async function POST(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const identity = getIdentityFromRequest(request);
  if (!identity) return NextResponse.json({ error: "Name is required." }, { status: 401 });

  const { slug } = await context.params;
  const page = await prisma.page.findUnique({ where: { slug } });

  if (!page) return NextResponse.json({ error: "Page not found." }, { status: 404 });
  if (!page.accessPasswordHash) {
    return NextResponse.json({ error: "Access password is not configured." }, { status: 403 });
  }
  if (!isShareAccessRequest(request, page)) {
    return NextResponse.json({ error: "Access password is required." }, { status: 403 });
  }

  try {
    const input = assertCommentInput((await request.json()) as Record<string, unknown>);
    const comment = await prisma.comment.create({
      data: {
        id: newId(),
        pageId: page.id,
        authorName: identity.name,
        ...input,
      },
    });

    return NextResponse.json({ comment: serializeComment(comment) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid comment.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
