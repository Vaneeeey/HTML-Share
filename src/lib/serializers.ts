import type { Comment, CommentReply, Page } from "@prisma/client";

export type SerializedComment = ReturnType<typeof serializeComment>;
export type SerializedPage = ReturnType<typeof serializePage>;
export type SerializedReply = ReturnType<typeof serializeReply>;

type Viewer = {
  identityId?: string | null;
  isAdmin?: boolean;
};

type CommentWithReplies = Comment & {
  replies?: CommentReply[];
};

export function serializePage(page: Page & { _count?: { comments: number } }) {
  return {
    id: page.id,
    slug: page.slug,
    title: page.title,
    entryPath: page.entryPath,
    uploadType: page.uploadType,
    originalName: page.originalName,
    hasAccessPassword: Boolean(page.accessPasswordHash),
    createdAt: page.createdAt.toISOString(),
    updatedAt: page.updatedAt.toISOString(),
    commentCount: page._count?.comments ?? 0,
  };
}

export function serializeReply(reply: CommentReply, viewer: Viewer = {}) {
  const isOwner = Boolean(viewer.identityId && reply.authorIdentityId === viewer.identityId);
  return {
    id: reply.id,
    commentId: reply.commentId,
    authorName: reply.authorName,
    body: reply.body,
    canDelete: isOwner || Boolean(viewer.isAdmin),
    canEdit: isOwner,
    createdAt: reply.createdAt.toISOString(),
    updatedAt: reply.updatedAt.toISOString(),
  };
}

export function serializeComment(comment: CommentWithReplies, viewer: Viewer = {}) {
  const isOwner = Boolean(viewer.identityId && comment.authorIdentityId === viewer.identityId);
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
    targetMeta: parseJsonField(comment.targetMeta),
    status: comment.status,
    canDelete: isOwner || Boolean(viewer.isAdmin),
    canEdit: isOwner,
    canResolve: Boolean(viewer.isAdmin),
    replies: (comment.replies ?? []).map((reply) => serializeReply(reply, viewer)),
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
