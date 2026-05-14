import type { Page } from "@prisma/client";
import type { NextRequest } from "next/server";
import { isShareAccessRequest } from "@/lib/access";
import { getIdentityFromRequest, isAdminRequest } from "@/lib/auth";

export type RequestActor =
  | { identityId: string; isAdmin: boolean; name: string }
  | { identityId: null; isAdmin: true; name: "Admin" };

export function getCommentActor(
  request: NextRequest,
  page: Pick<Page, "accessPasswordHash" | "id">,
) {
  const identity = getIdentityFromRequest(request);
  if (isAdminRequest(request)) {
    return identity
      ? ({ identityId: identity.identityId, isAdmin: true, name: identity.name } as const)
      : ({ identityId: null, isAdmin: true, name: "Admin" } as const);
  }

  if (!identity) return { error: "Name is required.", status: 401 } as const;
  if (!page.accessPasswordHash) {
    return { error: "Access password is not configured.", status: 403 } as const;
  }
  if (!isShareAccessRequest(request, page)) {
    return { error: "Access password is required.", status: 403 } as const;
  }

  return { identityId: identity.identityId, isAdmin: false, name: identity.name } as const;
}

export function actorCanDelete(actor: RequestActor, authorIdentityId: string | null) {
  return actor.isAdmin || Boolean(authorIdentityId && actor.identityId === authorIdentityId);
}

export function actorCanEdit(actor: RequestActor, authorIdentityId: string | null) {
  return Boolean(authorIdentityId && actor.identityId === authorIdentityId);
}
