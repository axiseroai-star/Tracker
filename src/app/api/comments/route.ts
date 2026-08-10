import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createComment, queryVisibleCommentsForLogEntry } from "@/lib/notion";
import { getSession } from "@/lib/auth";

/**
 * Member-facing thread endpoints (§16d) — any authenticated session (member
 * or admin), unlike /api/admin/comments which is admin-only and also sees
 * hidden comments. This surface only ever reads/writes *visible* comments.
 */

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });

  const logEntryId = request.nextUrl.searchParams.get("logEntryId");
  if (!logEntryId) {
    return NextResponse.json({ ok: false, error: "logEntryId is required." }, { status: 400 });
  }

  try {
    const comments = await queryVisibleCommentsForLogEntry(logEntryId);
    return NextResponse.json({ comments });
  } catch (error) {
    console.error(
      "Failed to load comments:",
      error instanceof Error ? error.message : "unknown error"
    );
    return NextResponse.json({ error: "Failed to load comments." }, { status: 500 });
  }
}

/** A reply — always tagged with the submitted Author and Visible To Person = true (§16d). */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const { logEntryId, comment, author } = (body ?? {}) as Record<string, unknown>;

  if (typeof logEntryId !== "string" || logEntryId.length === 0) {
    return NextResponse.json({ ok: false, error: "logEntryId is required." }, { status: 400 });
  }
  if (typeof comment !== "string" || comment.trim().length === 0) {
    return NextResponse.json({ ok: false, error: "Comment text is required." }, { status: 400 });
  }
  if (typeof author !== "string" || author.trim().length === 0) {
    return NextResponse.json({ ok: false, error: "Author is required." }, { status: 400 });
  }

  try {
    await createComment({
      logEntryId,
      comment: comment.trim().slice(0, 2000),
      author: author.trim(),
      visibleToPerson: true,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(
      "Failed to create reply:",
      error instanceof Error ? error.message : "unknown error"
    );
    return NextResponse.json({ ok: false, error: "Failed to save reply." }, { status: 500 });
  }
}
