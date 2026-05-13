import { notFound } from "next/navigation";
import { verifyShareAccessToken, shareAccessCookieName } from "@/lib/access";
import { getIdentityFromCookies } from "@/lib/auth";
import { ShareClient } from "@/components/ShareClient";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { serializeComment, serializePage } from "@/lib/serializers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function SharePage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const identity = await getIdentityFromCookies();
  const page = await prisma.page.findUnique({
    where: { slug },
    include: {
      comments: { orderBy: { createdAt: "asc" } },
      _count: { select: { comments: true } },
    },
  });

  if (!page) notFound();

  const cookieStore = await cookies();
  const accessGranted =
    Boolean(identity) &&
    verifyShareAccessToken(page, cookieStore.get(shareAccessCookieName(page.id))?.value);
  const initialComments = accessGranted ? page.comments.map(serializeComment) : [];

  return (
    <ShareClient
      accessGranted={accessGranted}
      identityName={identity?.name ?? null}
      initialComments={initialComments}
      page={serializePage(page)}
    />
  );
}
