import { notFound, redirect } from "next/navigation";
import { PageReviewClient } from "@/components/PageReviewClient";
import { isAdminFromCookies } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serializeComment, serializePage } from "@/lib/serializers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function PageDetailPage(props: { params: Promise<{ id: string }> }) {
  if (!(await isAdminFromCookies())) redirect("/login");
  const { id } = await props.params;

  const page = await prisma.page.findUnique({
    where: { id },
    include: {
      comments: { orderBy: { createdAt: "asc" } },
      _count: { select: { comments: true } },
    },
  });

  if (!page) notFound();

  return (
    <PageReviewClient
      page={serializePage(page)}
      initialComments={page.comments.map(serializeComment)}
    />
  );
}
