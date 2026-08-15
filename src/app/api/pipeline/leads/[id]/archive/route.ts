import { NextResponse } from "next/server";
import { getSession, requireOwnerOrAdmin } from "@/lib/auth";
import { archiveLead, getLeadById } from "@/lib/pipeline-db";

/**
 * POST — soft-delete (archive) a lead. Owner or admin only (rule §1/§2);
 * allowed regardless of the lead's current status (rule §3) — this is for
 * fixing mistakes, not a business-stage action. Never a hard delete: this
 * only ever sets archived_at, the row stays intact (rule §6).
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await params;
  const leadId = Number(id);
  if (!Number.isInteger(leadId)) {
    return NextResponse.json({ ok: false, error: "Invalid lead id." }, { status: 400 });
  }

  const lead = await getLeadById(leadId);
  if (!lead) {
    return NextResponse.json({ ok: false, error: "Lead not found." }, { status: 404 });
  }

  const denied = await requireOwnerOrAdmin(lead.owner);
  if (denied) return denied;

  try {
    const updated = await archiveLead(leadId);
    if (!updated) {
      return NextResponse.json({ ok: false, error: "Lead not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, lead: updated });
  } catch (error) {
    console.error(
      "Failed to archive lead:",
      error instanceof Error ? error.message : "unknown error"
    );
    return NextResponse.json({ ok: false, error: "Failed to delete lead." }, { status: 500 });
  }
}
