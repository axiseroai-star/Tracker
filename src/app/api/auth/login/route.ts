import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createSession } from "@/lib/auth";
import { getPersonAuthByName, setPersonPin } from "@/lib/notion";
import { hashPin, isValidPinFormat, verifyPin } from "@/lib/pin";
import { clientIp, isRateLimited } from "@/lib/rate-limit";

/**
 * §20b — one endpoint, two flows, chosen server-side by whether the person
 * already has a PIN Hash (never trust the client's idea of which flow it
 * thinks it's in):
 *   - No PIN Hash yet -> "Create your PIN": requires a matching confirmPin,
 *     hashes it, saves it, logs them in. This is how everyone bootstraps
 *     their own credential — no admin has to pre-generate anything.
 *   - PIN Hash already set -> "Enter your PIN": bcrypt-compare against it.
 */
export async function POST(request: NextRequest) {
  const ip = clientIp(request.headers);
  // PINs are lower-entropy than a chosen password (4-6 digits), so this
  // stays tight; bcrypt's inherent cost is the other half of the mitigation.
  if (isRateLimited(`login:${ip}`, { limit: 5, windowMs: 60_000 })) {
    return NextResponse.json(
      { ok: false, error: "Too many attempts. Try again in a minute." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  // Never log the PIN, the confirm PIN, or any hash.
  const { name, pin, confirmPin } = (body ?? {}) as Record<string, unknown>;

  if (typeof name !== "string" || name.length === 0) {
    return NextResponse.json({ ok: false, error: "Pick a name first." }, { status: 400 });
  }
  if (typeof pin !== "string" || !isValidPinFormat(pin)) {
    return NextResponse.json(
      { ok: false, error: "PIN must be 4-6 digits." },
      { status: 400 }
    );
  }

  const person = await getPersonAuthByName(name);
  if (!person || !person.active) {
    return NextResponse.json(
      { ok: false, error: "Unknown or inactive team member." },
      { status: 400 }
    );
  }

  const role = person.isAdmin ? "admin" : "member";

  if (!person.pinHash) {
    // Create flow.
    if (typeof confirmPin !== "string" || confirmPin !== pin) {
      return NextResponse.json({ ok: false, error: "PINs don't match." }, { status: 400 });
    }
    const hash = await hashPin(pin);
    await setPersonPin(person.id, hash);
    await createSession(person.name, role);
    return NextResponse.json({ ok: true, created: true, role });
  }

  // Verify flow.
  const valid = await verifyPin(pin, person.pinHash);
  if (!valid) {
    return NextResponse.json({ ok: false, error: "Incorrect PIN." }, { status: 401 });
  }

  await createSession(person.name, role);
  return NextResponse.json({ ok: true, created: false, role });
}
