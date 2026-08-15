import { NextResponse } from "next/server";
import { requireAdminResponse } from "@/lib/auth";
import { takeOverLead } from "@/lib/pipeline-db";

/** POST — admin-only "take over": status -> Handed Off, a terminal state (rule §5). */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdminResponse();
  if (denied) return denied;

  const { id } = await params;
  const leadId = Number(id);
  if (!Number.isInteger(leadId)) {
    return NextResponse.json({ ok: false, error: "Invalid lead id." }, { status: 400 });
  }

  try {
    const lead = await takeOverLead(leadId);
    if (!lead) {
      return NextResponse.json({ ok: false, error: "Lead not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, lead });
  } catch (error) {
    console.error(
      "Failed to take over lead:",
      error instanceof Error ? error.message : "unknown error"
    );
    return NextResponse.json({ ok: false, error: "Failed to take over lead." }, { status: 500 });
  }
}
