import { redirect } from "next/navigation";
import { DashboardClient } from "@/components/DashboardClient";
import { isAdminFromCookies } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serializePage } from "@/lib/serializers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  if (!(await isAdminFromCookies())) redirect("/login");

  const pages = await prisma.page.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { comments: true } } },
  });

  return <DashboardClient initialPages={pages.map(serializePage)} />;
}
