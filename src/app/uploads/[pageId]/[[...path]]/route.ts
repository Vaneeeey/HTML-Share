import fs from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { injectBridge } from "@/lib/bridge";
import { contentTypeFor } from "@/lib/mime";
import { normalizeRelativePath, resolveUploadPath } from "@/lib/paths";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ pageId: string; path?: string[] }> },
) {
  const { pageId, path: pathParts } = await context.params;
  const relativePath = normalizeRelativePath((pathParts ?? ["index.html"]).join("/"));
  const page = await prisma.page.findUnique({ where: { id: pageId } });

  if (!page) return NextResponse.json({ error: "Upload not found." }, { status: 404 });

  const fullPath = resolveUploadPath(pageId, relativePath || page.entryPath);

  try {
    const bytes = await fs.readFile(fullPath);
    const contentType = contentTypeFor(fullPath);
    const headers = new Headers({
      "Content-Type": contentType,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    });

    if (contentType.startsWith("text/html")) {
      return new NextResponse(injectBridge(bytes.toString("utf8")), { headers });
    }

    return new NextResponse(bytes, { headers });
  } catch {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }
}
