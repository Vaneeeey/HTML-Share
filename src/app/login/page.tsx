import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { isAdminFromCookies } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await isAdminFromCookies()) redirect("/dashboard");

  return (
    <main className="center-screen">
      <LoginForm />
    </main>
  );
}
