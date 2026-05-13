import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createIdentityToken, identityCookieName } from "@/lib/auth";

const prismaMock = vi.hoisted(() => ({
  page: {
    findUnique: vi.fn(),
  },
  comment: {
    create: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

function request(cookie = "") {
  return new NextRequest("http://localhost/api/share/page-slug/comments", {
    headers: cookie ? { cookie } : {},
  });
}

describe("share comments route access", () => {
  beforeEach(() => {
    process.env.APP_SECRET = "test-secret";
    prismaMock.page.findUnique.mockReset();
    prismaMock.comment.create.mockReset();
  });

  it("rejects comment reads without a signed identity cookie", async () => {
    const { GET } = await import("@/app/api/share/[slug]/comments/route");

    const response = await GET(request(), { params: Promise.resolve({ slug: "page-slug" }) });

    expect(response.status).toBe(401);
    expect(prismaMock.page.findUnique).not.toHaveBeenCalled();
  });

  it("rejects comment writes before page access is granted", async () => {
    prismaMock.page.findUnique.mockResolvedValue({
      id: "page-1",
      slug: "page-slug",
      accessPasswordHash: "pbkdf2_sha256$1$salt$hash",
    });
    const { POST } = await import("@/app/api/share/[slug]/comments/route");
    const identity = createIdentityToken("Lin");
    const nextRequest = new NextRequest("http://localhost/api/share/page-slug/comments", {
      body: JSON.stringify({ authorName: "Fake", body: "Fix", selector: "h1" }),
      headers: {
        "content-type": "application/json",
        cookie: `${identityCookieName}=${identity}`,
      },
      method: "POST",
    });

    const response = await POST(nextRequest, { params: Promise.resolve({ slug: "page-slug" }) });

    expect(response.status).toBe(403);
    expect(prismaMock.comment.create).not.toHaveBeenCalled();
  });
});
