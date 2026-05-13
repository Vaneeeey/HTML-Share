import { notFound } from "next/navigation";
import { ShareClient } from "@/components/ShareClient";
import { prisma } from "@/lib/prisma";
import { serializeComment, serializePage } from "@/lib/serializers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function SharePage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const page = await prisma.page.findUnique({
    where: { slug },
    include: {
      comments: { orderBy: { createdAt: "asc" } },
      _count: { select: { comments: true } },
    },
  });

  if (!page) notFound();

  return <ShareClient page={serializePage(page)} initialComments={page.comments.map(serializeComment)} />;
}
