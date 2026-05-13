import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest, unauthorized } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serializePage } from "@/lib/serializers";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) return unauthorized();

  const pages = await prisma.page.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { comments: true } } },
  });

  return NextResponse.json({ pages: pages.map(serializePage) });
}
