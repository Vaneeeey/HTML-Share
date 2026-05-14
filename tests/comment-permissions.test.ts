import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createShareAccessToken, shareAccessCookieName } from "@/lib/access";
import { createAdminToken, createIdentityToken, adminCookieName, identityCookieName } from "@/lib/auth";

const prismaMock = vi.hoisted(() => ({
  comment: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  commentReply: {
    create: vi.fn(),
    delete: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  page: {
    findUnique: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

const page = {
  accessPasswordHash: "hash-version-1",
  id: "page-1",
  slug: "page-slug",
};

function authCookie(identityId: string, name = "Lin") {
  const identity = createIdentityToken(name, identityId);
  const access = createShareAccessToken(page);
  return `${identityCookieName}=${identity}; ${shareAccessCookieName(page.id)}=${access}`;
}

function jsonRequest(url: string, cookie: string, body: Record<string, unknown>, method = "PATCH") {
  return new NextRequest(url, {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      cookie,
    },
    method,
  });
}

describe("comment and reply permissions", () => {
  beforeEach(() => {
    process.env.ADMIN_PASSWORD = "admin-password";
    process.env.APP_SECRET = "test-secret";
    prismaMock.comment.findFirst.mockReset();
    prismaMock.comment.update.mockReset();
    prismaMock.commentReply.create.mockReset();
    prismaMock.commentReply.delete.mockReset();
    prismaMock.commentReply.findFirst.mockReset();
    prismaMock.commentReply.update.mockReset();
    prismaMock.page.findUnique.mockReset();
    prismaMock.page.findUnique.mockResolvedValue(page);
  });

  it("allows a comment author to edit their own comment", async () => {
    const existing = {
      authorIdentityId: "owner-id",
      authorName: "Lin",
      body: "Old body",
      createdAt: new Date(),
      id: "comment-1",
      pageId: page.id,
      rect: "{}",
      replies: [],
      selector: "h1",
      status: "open",
      textSnippet: "Title",
      updatedAt: new Date(),
      viewport: "{}",
      xpath: "",
    };
    prismaMock.comment.findFirst.mockResolvedValue(existing);
    prismaMock.comment.update.mockResolvedValue({ ...existing, body: "New body" });
    const { PATCH } = await import("@/app/api/share/[slug]/comments/[id]/route");

    const response = await PATCH(
      jsonRequest("http://localhost/api/share/page-slug/comments/comment-1", authCookie("owner-id"), {
        body: "New body",
      }),
      { params: Promise.resolve({ id: "comment-1", slug: "page-slug" }) },
    );

    expect(response.status).toBe(200);
    expect(prismaMock.comment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { body: "New body" } }),
    );
  });

  it("rejects same-name users with a different identity id", async () => {
    prismaMock.comment.findFirst.mockResolvedValue({
      authorIdentityId: "owner-id",
      id: "comment-1",
      pageId: page.id,
    });
    const { DELETE } = await import("@/app/api/share/[slug]/comments/[id]/route");

    const response = await DELETE(
      new NextRequest("http://localhost/api/share/page-slug/comments/comment-1", {
        headers: { cookie: authCookie("other-id", "Lin") },
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "comment-1", slug: "page-slug" }) },
    );

    expect(response.status).toBe(403);
  });

  it("creates replies with the server-side identity", async () => {
    prismaMock.comment.findFirst.mockResolvedValue({ id: "comment-1", pageId: page.id });
    prismaMock.commentReply.create.mockResolvedValue({
      authorIdentityId: "reply-owner",
      authorName: "Reply User",
      body: "Reply body",
      commentId: "comment-1",
      createdAt: new Date(),
      id: "reply-1",
      updatedAt: new Date(),
    });
    const { POST } = await import("@/app/api/share/[slug]/comments/[id]/replies/route");

    const response = await POST(
      jsonRequest(
        "http://localhost/api/share/page-slug/comments/comment-1/replies",
        authCookie("reply-owner", "Reply User"),
        { authorIdentityId: "forged", authorName: "Forged", body: "Reply body" },
        "POST",
      ),
      { params: Promise.resolve({ id: "comment-1", slug: "page-slug" }) },
    );
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(prismaMock.commentReply.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          authorIdentityId: "reply-owner",
          authorName: "Reply User",
        }),
      }),
    );
    expect(data.reply.authorName).toBe("Reply User");
  });

  it("allows admins to manually mark a comment resolved without touching replies", async () => {
    const comment = {
      authorIdentityId: "owner-id",
      authorName: "Lin",
      body: "Comment",
      createdAt: new Date(),
      id: "comment-1",
      pageId: page.id,
      rect: "{}",
      replies: [],
      selector: "h1",
      status: "resolved",
      textSnippet: "Title",
      updatedAt: new Date(),
      viewport: "{}",
      xpath: "",
    };
    prismaMock.comment.update.mockResolvedValue(comment);
    const { PATCH } = await import("@/app/api/comments/[id]/route");

    const response = await PATCH(
      jsonRequest(
        "http://localhost/api/comments/comment-1",
        `${adminCookieName}=${createAdminToken()}`,
        { status: "resolved" },
      ),
      { params: Promise.resolve({ id: "comment-1" }) },
    );

    expect(response.status).toBe(200);
    expect(prismaMock.comment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "resolved" } }),
    );
  });
});
