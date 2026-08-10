import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Resend } from "resend";
import { queryAllDailyLogEntriesForAdmin } from "@/lib/notion";
import { toCsv } from "@/lib/format";
import { requireCronSecretResponse } from "@/lib/auth";

/** Weekly scheduled CSV backup (§16e) — triggered by Vercel Cron (see vercel.json). */
export async function GET(request: NextRequest) {
  const denied = requireCronSecretResponse(request);
  if (denied) return denied;

  const resendApiKey = process.env.RESEND_API_KEY;
  const backupEmailTo = process.env.BACKUP_EMAIL_TO;
  if (!resendApiKey || !backupEmailTo) {
    // No-op gracefully (§16e) — this is an optional feature the admin hasn't
    // finished setting up yet, not an error worth alerting on.
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "RESEND_API_KEY and/or BACKUP_EMAIL_TO not configured.",
    });
  }

  try {
    const entries = await queryAllDailyLogEntriesForAdmin();
    const csv = toCsv(
      ["Person", "Channel", "Date", "Output Count", "Notes", "Archived", "Flagged"],
      entries.map((e) => [
        e.person,
        e.channel,
        e.date,
        e.outputCount,
        e.notes ?? "",
        e.archived ? "yes" : "no",
        e.flagged ? "yes" : "no",
      ])
    );

    const dateStamp = new Date().toISOString().slice(0, 10);
    const resend = new Resend(resendApiKey);
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "Axisero Tracker <onboarding@resend.dev>",
      to: backupEmailTo,
      subject: `Axisero Output Tracker — weekly backup (${dateStamp})`,
      text: `Full Daily Log export as of ${dateStamp} — ${entries.length} rows attached as CSV.`,
      attachments: [
        {
          filename: `axisero-daily-log-${dateStamp}.csv`,
          content: Buffer.from(csv, "utf-8"),
        },
      ],
    });
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, rows: entries.length });
  } catch (error) {
    // Never log RESEND_API_KEY or the full error object — just the message.
    console.error(
      "Backup job failed:",
      error instanceof Error ? error.message : "unknown error"
    );
    return NextResponse.json({ ok: false, error: "Backup failed." }, { status: 500 });
  }
}
