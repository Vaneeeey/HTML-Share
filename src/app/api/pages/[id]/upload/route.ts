import { NextRequest, NextResponse } from "next/server";
import { getIdentityFromRequest, isAdminRequest, unauthorized } from "@/lib/auth";
import { serializeComment, serializePage } from "@/lib/serializers";
import { replacePageUpload, UploadError } from "@/lib/upload";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return unauthorized();
  const { id } = await context.params;

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const mode = String(formData.get("mode") ?? "");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File is required." }, { status: 400 });
    }
    if (mode !== "reupload" && mode !== "update") {
      return NextResponse.json({ error: "Upload mode is required." }, { status: 400 });
    }

    const page = await replacePageUpload(id, file, mode === "update");

    const identity = getIdentityFromRequest(request);
    return NextResponse.json({
      page: serializePage(page),
      comments: page.comments.map((comment) =>
        serializeComment(comment, { identityId: identity?.identityId, isAdmin: true }),
      ),
    });
  } catch (error) {
    const status = error instanceof UploadError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Upload failed.";
    return NextResponse.json({ error: message }, { status });
  }
}
