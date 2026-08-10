import { NextResponse } from "next/server";
import { queryAllTargets } from "@/lib/notion";
import { PEOPLE } from "@/lib/constants";

export async function GET() {
  try {
    const targets = await queryAllTargets();
    const groups = PEOPLE.map((person) => ({
      person,
      channels: targets
        .filter((t) => t.person === person)
        .sort((a, b) => a.channel.localeCompare(b.channel)),
    }));
    return NextResponse.json({ groups });
  } catch (error) {
    console.error(
      "Failed to load targets:",
      error instanceof Error ? error.message : "unknown error"
    );
    return NextResponse.json({ error: "Failed to load targets." }, { status: 500 });
  }
}
