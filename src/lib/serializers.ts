import type { Comment, Page } from "@prisma/client";

export type SerializedComment = ReturnType<typeof serializeComment>;
export type SerializedPage = ReturnType<typeof serializePage>;

export function serializePage(page: Page & { _count?: { comments: number } }) {
  return {
    id: page.id,
    slug: page.slug,
    title: page.title,
    entryPath: page.entryPath,
    uploadType: page.uploadType,
    originalName: page.originalName,
    createdAt: page.createdAt.toISOString(),
    updatedAt: page.updatedAt.toISOString(),
    commentCount: page._count?.comments ?? 0,
  };
}

export function serializeComment(comment: Comment) {
  return {
    id: comment.id,
    pageId: comment.pageId,
    authorName: comment.authorName,
    body: comment.body,
    selector: comment.selector,
    xpath: comment.xpath,
    textSnippet: comment.textSnippet,
    rect: parseJsonField(comment.rect),
    viewport: parseJsonField(comment.viewport),
    status: comment.status,
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString(),
  };
}

function parseJsonField(value: string) {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}
