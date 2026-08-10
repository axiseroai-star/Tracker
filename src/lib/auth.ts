import "server-only";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Per-person PIN login (§20). The session cookie carries a signed
 * (HMAC-SHA256) JSON payload — the logged-in person's name, their role, and
 * an issue timestamp — never a password or PIN. Signing key is
 * SESSION_SECRET.
 *
 * This replaces the old shared APP_PASSWORD/ADMIN_PASSWORDS model entirely:
 * every person authenticates as themselves (PIN, verified against their own
 * bcrypt hash in Axisero People — see lib/pin.ts and lib/notion.ts), and
 * `role` is read from their `Is Admin` flag at login time rather than from
 * which of two shared passwords was typed.
 */

export type Role = "member" | "admin";

export interface SessionPayload {
  person: string;
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

function buildToken(person: string, role: Role): string {
  const payloadB64 = Buffer.from(
    JSON.stringify({ v: 3, person, role, iat: Date.now() } satisfies SessionPayload & {
      v: number;
    })
  ).toString("base64url");
  return `${payloadB64}.${sign(payloadB64)}`;
}

function isRole(value: unknown): value is Role {
  return value === "member" || value === "admin";
}

/**
 * Pure verification + parsing, safe to call from `proxy.ts` (no `next/headers`
 * there) — it only needs the raw cookie value pulled off the request.
 * Returns null for a missing, tampered, or pre-§20 (v1/v2, no `person`) cookie
 * — those simply force a re-login, which is correct: there's no person
 * identity to recover from an old shared-password session anyway.
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
    if (
      !isRole(parsed?.role) ||
      typeof parsed?.iat !== "number" ||
      typeof parsed?.person !== "string" ||
      parsed.person.length === 0
    ) {
      return null;
    }
    return { person: parsed.person, role: parsed.role, iat: parsed.iat };
  } catch {
    return null;
  }
}

export function isValidSessionToken(token: string | undefined | null): boolean {
  return parseSessionToken(token) !== null;
}

export async function createSession(person: string, role: Role): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, buildToken(person, role), {
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

/**
 * Guard for every /api/cron/* route handler (§16e/§16g) — these are hit by
 * Vercel Cron, not a logged-in session, so they need their own check rather
 * than requireAdminResponse. Vercel automatically sends
 * `Authorization: Bearer $CRON_SECRET` when that env var is configured on
 * the project. Missing CRON_SECRET fails closed (rejects everything) — an
 * unset secret is a misconfiguration, not an "optional feature" state.
 */
export function requireCronSecretResponse(request: Request): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("CRON_SECRET is not configured — refusing to run a cron job.");
    return NextResponse.json({ ok: false, error: "Not configured." }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  return null;
}
