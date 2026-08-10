"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import type { Role } from "@/lib/auth";

/**
 * Left sidebar navigation (§22), replacing the old per-page top-bar chrome.
 * Rendered once by app/(app)/layout.tsx, wrapping every authenticated page
 * except /login (pre-auth) and /meeting (deliberately chrome-free per §16i
 * so it survives being shrunk into a screen-share) — those two routes live
 * outside the (app) route group and never see this shell.
 *
 * `role` only controls whether the Admin link/tab is *rendered* here — it's
 * not the access control. /app/(app)/admin/page.tsx redirects non-admins
 * server-side regardless of what this component shows (§13a, unchanged).
 */

const NAV_ITEMS: { href: string; label: string }[] = [
  { href: "/", label: "Dashboard" },
  { href: "/targets", label: "Targets" },
  { href: "/trends", label: "Trends" },
  { href: "/meeting", label: "Meeting view" },
];

const ADMIN_ITEM = { href: "/admin", label: "Admin" };

export default function AppShell({
  person,
  role,
  children,
}: {
  /** Logged-in person's name (§20 session identity), shown pinned at the sidebar's bottom. */
  person: string;
  role: Role;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);

  const navItems = role === "admin" ? [...NAV_ITEMS, ADMIN_ITEM] : NAV_ITEMS;
  // Mobile bottom tab bar only keeps Dashboard + Log always visible (§22b);
  // everything else collapses into "More".
  const moreItems = navItems.filter((item) => item.href !== "/");
  const moreActive = moreItems.some((item) => item.href === pathname);

  async function handleLogout() {
    setMoreOpen(false);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-full">
      {/* Desktop sidebar (§22a), ≥768px */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r border-line bg-card md:flex">
        <div className="flex-1 overflow-y-auto p-4">
          <div className="mb-5">
            <p className="text-lg font-bold leading-tight text-ink">Axisero</p>
            <p className="text-xs text-ink-muted">Output Tracker</p>
          </div>

          <Link
            href="/log"
            className="mb-5 block w-full rounded-lg bg-accent px-3 py-2.5 text-center text-sm font-semibold text-white hover:opacity-90"
          >
            + Log output
          </Link>

          <nav className="flex flex-col gap-1">
            {navItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-lg px-3 py-2 text-sm font-medium ${
                    active ? "bg-accent-soft text-accent" : "text-ink-muted hover:text-ink"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="border-t border-line p-4">
          <p className="truncate text-sm font-medium text-ink" title={person}>
            {person}
          </p>
          <button
            type="button"
            onClick={handleLogout}
            className="mt-1 text-sm font-medium text-ink-muted hover:text-ink"
          >
            Log out
          </button>
        </div>
      </aside>

      {/* Main content — pushed right of the fixed sidebar on desktop, given
          bottom clearance for the fixed tab bar on mobile. */}
      <div className="pb-20 md:pb-0 md:pl-56">{children}</div>

      {/* Mobile bottom tab bar (§22b), <768px — not a hamburger drawer, so
          "Log output" stays one tap away at all times. */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-card md:hidden">
        <Link
          href="/"
          className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium ${
            pathname === "/" ? "text-accent" : "text-ink-muted"
          }`}
        >
          <HomeIcon />
          Dashboard
        </Link>
        <Link
          href="/log"
          className="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium text-accent"
        >
          <PlusIcon />
          Log
        </Link>
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium ${
            moreOpen || moreActive ? "text-accent" : "text-ink-muted"
          }`}
        >
          <MoreIcon />
          More
        </button>
      </nav>

      {moreOpen && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMoreOpen(false)}
            className="fixed inset-0 z-30 bg-ink/20 md:hidden"
          />
          <div className="fixed inset-x-3 bottom-20 z-40 rounded-card border border-line bg-card p-2 shadow-lg md:hidden">
            {moreItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  className={`block rounded-lg px-3 py-2.5 text-sm font-medium ${
                    active ? "bg-accent-soft text-accent" : "text-ink hover:bg-page"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
            <div className="my-1 border-t border-line" />
            <p className="truncate px-3 py-1.5 text-xs text-ink-muted" title={person}>
              Signed in as {person}
            </p>
            <button
              type="button"
              onClick={handleLogout}
              className="block w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium text-ink hover:bg-page"
            >
              Log out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function HomeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10v9a1 1 0 0 0 1 1H9a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1h2.5a1 1 0 0 0 1-1v-9" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="5" cy="12" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="19" cy="12" r="1.75" />
    </svg>
  );
}
