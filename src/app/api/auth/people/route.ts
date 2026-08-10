import { NextResponse } from "next/server";
import { queryAllPeople } from "@/lib/notion";

/**
 * Pre-auth (§20b) — /login needs to show the Active roster to pick a name
 * from before any session exists, so this sits under /api/auth/* (already
 * exempted from the session gate in proxy.ts, same as /api/auth/login).
 * Only names and whether a PIN already exists — never anything sensitive.
 */
export async function GET() {
  try {
    const people = await queryAllPeople();
    const active = people
      .filter((p) => p.active)
      .map((p) => ({ name: p.name, hasPin: p.hasPin }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json({ people: active });
  } catch (error) {
    console.error(
      "Failed to load people for login:",
      error instanceof Error ? error.message : "unknown error"
    );
    return NextResponse.json({ error: "Failed to load team list." }, { status: 500 });
  }
}
