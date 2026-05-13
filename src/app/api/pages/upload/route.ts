import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest, unauthorized } from "@/lib/auth";
import { createPageFromUpload, UploadError } from "@/lib/upload";
import { serializePage } from "@/lib/serializers";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) return unauthorized();

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File is required." }, { status: 400 });
    }

    const page = await createPageFromUpload(file);
    return NextResponse.json({ page: serializePage(page) }, { status: 201 });
  } catch (error) {
    const status = error instanceof UploadError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Upload failed.";
    return NextResponse.json({ error: message }, { status });
  }
}
