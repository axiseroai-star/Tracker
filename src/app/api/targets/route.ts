import { NextResponse } from "next/server";
import { queryAllPeople, queryAllTargets } from "@/lib/notion";

/**
 * Returns every Targets row (including archived — §18c), grouped by the
 * live Active roster (§18). Consumers decide what to do with archived rows:
 * the read-only /targets page hides them, /admin's Responsibilities editor
 * shows them behind a "show archived" toggle with a restore control, same
 * pattern as the Daily Log admin table.
 */
export async function GET() {
  try {
    const [allPeople, targets] = await Promise.all([queryAllPeople(), queryAllTargets()]);
    const activePeople = allPeople.filter((p) => p.active);

    const groups = activePeople.map((person) => ({
      person: person.name,
      channels: targets
        .filter((t) => t.person === person.name)
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
