import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { deleteComment, queryCommentById, updateComment } from "@/lib/notion";
import { getSession } from "@/lib/auth";

/**
 * §16d/§20 edit/delete: admin can act on any comment; a member can only act
 * on a comment whose Author matches their own verified session identity —
 * no more self-reported "acting as," since login now proves who's typing.
 */
async function checkPermission(commentId: string): Promise<NextResponse | null> {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  if (session.role === "admin") return null;

  const existing = await queryCommentById(commentId);
  if (!existing) {
    return NextResponse.json({ ok: false, error: "Comment not found." }, { status: 404 });
  }
  if (existing.author !== session.person) {
    return NextResponse.json(
      { ok: false, error: "You can only edit or delete your own replies." },
      { status: 403 }
    );
  }
  return null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  const { comment } = (body ?? {}) as Record<string, unknown>;

  const denied = await checkPermission(id);
  if (denied) return denied;

  if (typeof comment !== "string" || comment.trim().length === 0) {
    return NextResponse.json({ ok: false, error: "Comment text is required." }, { status: 400 });
  }

  try {
    await updateComment(id, { comment: comment.trim().slice(0, 2000) });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(
      "Failed to update comment:",
      error instanceof Error ? error.message : "unknown error"
    );
    return NextResponse.json({ ok: false, error: "Failed to update comment." }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const denied = await checkPermission(id);
  if (denied) return denied;

  try {
    await deleteComment(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(
      "Failed to delete comment:",
      error instanceof Error ? error.message : "unknown error"
    );
    return NextResponse.json({ ok: false, error: "Failed to delete comment." }, { status: 500 });
  }
}
