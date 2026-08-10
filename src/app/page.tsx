import { getSession } from "@/lib/auth";
import DashboardClient from "@/components/DashboardClient";

// Server Component: resolves the session (and therefore role) server-side so
// the "Admin" nav link is never decided client-side from data the client
// could tamper with. (proxy.ts already guarantees a session exists here.)
export default async function DashboardPage() {
  const session = await getSession();
  return <DashboardClient role={session?.role ?? "member"} />;
}
