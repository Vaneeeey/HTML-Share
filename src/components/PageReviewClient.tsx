"use client";

import { ReviewWorkspace } from "@/components/ReviewWorkspace";
import type { SerializedComment, SerializedPage } from "@/lib/serializers";

type Props = {
  identityName: string;
  page: SerializedPage;
  initialComments: SerializedComment[];
};

export function PageReviewClient({ identityName, page, initialComments }: Props) {
  return (
    <ReviewWorkspace
      identityName={identityName}
      initialComments={initialComments}
      initialMode="interact"
      isAdmin
      page={page}
    />
  );
}
