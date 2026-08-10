import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import AdminClient from "@/components/AdminClient";

// Authoritative, server-side role check (§13a) — this runs even if someone
// reaches /admin directly, bypassing proxy.ts's optimistic redirect and any
// client-side nav-link hiding.
export default async function AdminPage() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    redirect("/");
  }

  return <AdminClient />;
}
