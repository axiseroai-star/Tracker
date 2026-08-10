import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdminResponse } from "@/lib/auth";
import { createComment, queryCommentsForLogEntry } from "@/lib/notion";

/** Every comment (visible or not) on one Daily Log row — admin only. */
export async function GET(request: NextRequest) {
  const denied = await requireAdminResponse();
  if (denied) return denied;

  const logEntryId = request.nextUrl.searchParams.get("logEntryId");
  if (!logEntryId) {
    return NextResponse.json({ ok: false, error: "logEntryId is required." }, { status: 400 });
  }

  try {
    const comments = await queryCommentsForLogEntry(logEntryId);
    return NextResponse.json({ comments });
  } catch (error) {
    console.error(
      "Failed to load comments:",
      error instanceof Error ? error.message : "unknown error"
    );
    return NextResponse.json({ error: "Failed to load comments." }, { status: 500 });
  }
}

/** New comments default to Visible To Person = true (§13b). */
export async function POST(request: NextRequest) {
  const denied = await requireAdminResponse();
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const { logEntryId, comment, visibleToPerson } = (body ?? {}) as Record<string, unknown>;

  if (typeof logEntryId !== "string" || logEntryId.length === 0) {
    return NextResponse.json({ ok: false, error: "logEntryId is required." }, { status: 400 });
  }
  if (typeof comment !== "string" || comment.trim().length === 0) {
    return NextResponse.json({ ok: false, error: "Comment text is required." }, { status: 400 });
  }
  if (visibleToPerson !== undefined && typeof visibleToPerson !== "boolean") {
    return NextResponse.json(
      { ok: false, error: "visibleToPerson must be a boolean." },
      { status: 400 }
    );
  }

  try {
    await createComment({
      logEntryId,
      comment: comment.trim().slice(0, 2000),
      visibleToPerson,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(
      "Failed to create comment:",
      error instanceof Error ? error.message : "unknown error"
    );
    return NextResponse.json({ ok: false, error: "Failed to save comment." }, { status: 500 });
  }
}
