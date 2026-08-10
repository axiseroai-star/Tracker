import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import AppShell from "@/components/AppShell";

/**
 * Shared shell (§22) for every authenticated page except /login (pre-auth)
 * and /meeting (deliberately chrome-free per §16i, so it survives being
 * shrunk into a screen-share) — both live outside this route group. The
 * `(app)` folder name is excluded from the URL; it only groups these routes
 * onto one shared layout, it doesn't change any path.
 *
 * Nested inside the existing root layout (app/layout.tsx), not a second root
 * layout — <html>/<body> stay defined there, untouched.
 */
export default async function AppGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  // proxy.ts already guarantees a session exists for every route in this
  // group; this is a defensive fallback, same pattern used elsewhere.
  if (!session) redirect("/login");

  return (
    <AppShell person={session.person} role={session.role}>
      {children}
    </AppShell>
  );
}
