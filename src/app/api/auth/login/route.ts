import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createSession, resolveRole } from "@/lib/auth";
import { clientIp, isRateLimited } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const ip = clientIp(request.headers);
  if (isRateLimited(`login:${ip}`, { limit: 5, windowMs: 60_000 })) {
    return NextResponse.json(
      { ok: false, error: "Too many attempts. Try again in a minute." },
      { status: 429 }
    );
  }

  let password: unknown;
  try {
    const body = await request.json();
    password = body?.password;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  if (typeof password !== "string" || password.length === 0) {
    return NextResponse.json({ ok: false, error: "Password is required." }, { status: 400 });
  }

  // Never log the submitted password or either expected password.
  const role = resolveRole(password);
  if (!role) {
    return NextResponse.json({ ok: false, error: "Incorrect password." }, { status: 401 });
  }

  await createSession(role);
  return NextResponse.json({ ok: true, role });
}
