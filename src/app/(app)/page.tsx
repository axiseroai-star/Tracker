import { getSession } from "@/lib/auth";
import DashboardClient from "@/components/DashboardClient";

// Server Component: resolves the session server-side so comment-reply
// authorship is never decided client-side from data the client could
// tamper with. (proxy.ts already guarantees a session exists here; the
// "Admin" nav link itself now lives in the shared sidebar shell, §22.)
export default async function DashboardPage() {
  const session = await getSession();
  return <DashboardClient person={session?.person ?? ""} />;
}
