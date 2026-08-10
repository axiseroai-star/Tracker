import "server-only";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Single shared-password session, per the build spec — no per-user accounts.
 * The cookie carries a signed (HMAC-SHA256) JSON payload — an issue timestamp
 * and a role, never the password itself. Signing key is SESSION_SECRET.
 *
 * Two shared passwords now exist (§13a): APP_PASSWORD -> role "member",
 * ADMIN_PASSWORD -> role "admin". Same login form, same cookie mechanism.
 */

export type Role = "member" | "admin";

export interface SessionPayload {
  role: Role;
  iat: number;
}

export const SESSION_COOKIE_NAME = "axisero_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value) {
    throw new Error("Missing required environment variable: SESSION_SECRET");
  }
  return value;
}

function sign(payloadB64: string): string {
  return createHmac("sha256", secret()).update(payloadB64).digest("base64url");
}

function buildToken(role: Role): string {
  const payloadB64 = Buffer.from(
    JSON.stringify({ v: 2, role, iat: Date.now() } satisfies SessionPayload & { v: number })
  ).toString("base64url");
  return `${payloadB64}.${sign(payloadB64)}`;
}

function isRole(value: unknown): value is Role {
  return value === "member" || value === "admin";
}

/**
 * Pure verification + parsing, safe to call from `proxy.ts` (no `next/headers`
 * there) — it only needs the raw cookie value pulled off the request.
 * Returns null for a missing, tampered, or pre-role (v1) cookie.
 */
export function parseSessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, signature] = parts;

  let expected: Buffer;
  let actual: Buffer;
  try {
    expected = Buffer.from(sign(payloadB64));
    actual = Buffer.from(signature);
  } catch {
    return null;
  }
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    if (!isRole(parsed?.role) || typeof parsed?.iat !== "number") return null;
    return { role: parsed.role, iat: parsed.iat };
  } catch {
    return null;
  }
}

export function isValidSessionToken(token: string | undefined | null): boolean {
  return parseSessionToken(token) !== null;
}

export async function createSession(role: Role): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, buildToken(role), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  return parseSessionToken(store.get(SESSION_COOKIE_NAME)?.value);
}

export async function hasValidSession(): Promise<boolean> {
  return (await getSession()) !== null;
}

/**
 * Guard for every /api/admin/* route handler — call this first and return
 * immediately if it's non-null. Re-checks the cookie server-side on every
 * request; never rely on the nav link being hidden or on proxy.ts alone.
 */
export async function requireAdminResponse(): Promise<NextResponse | null> {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });
  }
  return null;
}

/** Constant-time compare against a known-good value; false (never throws) if it's empty. */
function matches(candidate: string, expected: string): boolean {
  if (!expected) return false;
  const a = createHmac("sha256", secret()).update(candidate).digest();
  const b = createHmac("sha256", secret()).update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * §16f: a second (or third, ...) admin. ADMIN_PASSWORDS is a comma-separated
 * list — any match grants admin. Falls back to the singular ADMIN_PASSWORD if
 * ADMIN_PASSWORDS isn't set, so existing single-admin setups don't break.
 */
function adminPasswords(): string[] {
  const list = process.env.ADMIN_PASSWORDS;
  if (list) {
    return list
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
  }
  return process.env.ADMIN_PASSWORD ? [process.env.ADMIN_PASSWORD] : [];
}

/** Resolves a submitted password to a role, admin checked first. Null if it matches neither. */
export function resolveRole(candidate: string): Role | null {
  for (const admin of adminPasswords()) {
    if (matches(candidate, admin)) return "admin";
  }
  if (matches(candidate, process.env.APP_PASSWORD ?? "")) return "member";
  return null;
}
