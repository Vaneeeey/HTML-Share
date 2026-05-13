import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { getIdentityFromCookies, isAdminFromCookies } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const isAdmin = await isAdminFromCookies();
  const identity = await getIdentityFromCookies();
  if (isAdmin && identity) redirect("/dashboard");

  return (
    <main className="center-screen">
      <LoginForm initialIdentityStep={isAdmin && !identity} />
    </main>
  );
}
