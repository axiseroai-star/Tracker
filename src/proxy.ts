import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { parseSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";

/**
 * Gate every route behind the shared-password session, except /login itself
 * and the auth API routes that issue/clear the session cookie.
 * (Formerly `middleware.ts` — renamed to `proxy.ts` in Next.js 16.)
 *
 * This is an *optimistic* check (redirects for UX) — it is not the
 * authoritative access control for /admin. Every /api/admin/* route and the
 * /admin page itself independently re-verify role === "admin" server-side
 * (see requireAdminResponse in lib/auth.ts and the redirect in
 * app/admin/page.tsx), because a hidden nav link and a proxy redirect are
 * not real access control on their own (§13a).
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/login" || pathname.startsWith("/api/auth/")) {
    return NextResponse.next();
  }

  // §16e/§16g: Vercel Cron requests carry no session cookie — they're
  // protected by their own CRON_SECRET check inside the route instead, so
  // they need to reach the route handler rather than bounce to /login.
  if (pathname.startsWith("/api/cron/")) {
    return NextResponse.next();
  }

  const session = parseSessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) {
    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/") {
      loginUrl.searchParams.set("next", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/api/admin/");
  if (isAdminRoute && session.role !== "admin") {
    // Members get bounced home rather than a 404/403 — quieter UX, and the
    // API layer still hard-blocks the actual request regardless.
    return pathname.startsWith("/api/")
      ? NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 })
      : NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
