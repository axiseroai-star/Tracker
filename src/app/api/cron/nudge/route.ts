import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireCronSecretResponse } from "@/lib/auth";
import { queryAllPeople, queryDailyLogByDateRange } from "@/lib/notion";
import { effectiveDate, localHourIn } from "@/lib/aggregate";
import { NUDGE_HOUR } from "@/lib/constants";
import { postToSlack, slackMention } from "@/lib/slack";

/**
 * Hourly Slack nudge (§16g) — for each Active person, checks whether their
 * *current local hour* (via their own §14a/§18 timezone) equals NUDGE_HOUR,
 * and if so whether they've logged anything for their own effectiveDate yet.
 * Running hourly and checking each person's local hour independently is
 * what makes one cron schedule work correctly across a Berlin/Karachi (or
 * any other) timezone split — nobody gets nudged at the wrong local time.
 */
export async function GET(request: NextRequest) {
  const denied = requireCronSecretResponse(request);
  if (denied) return denied;

  if (!process.env.SLACK_WEBHOOK_URL) {
    return NextResponse.json({ ok: true, skipped: true, reason: "SLACK_WEBHOOK_URL not configured." });
  }

  try {
    const now = new Date();
    const allPeople = await queryAllPeople();
    const duePeople = allPeople.filter(
      (p) => p.active && localHourIn(p.timezone, now) === NUDGE_HOUR
    );

    if (duePeople.length === 0) {
      return NextResponse.json({ ok: true, nudged: [] });
    }

    const nudged: string[] = [];
    for (const person of duePeople) {
      const today = effectiveDate(person.timezone, now);
      const logs = await queryDailyLogByDateRange(today, today);
      const hasLoggedToday = logs.some((l) => l.person === person.name);
      if (!hasLoggedToday) nudged.push(person.name);
    }

    if (nudged.length > 0) {
      const mentions = nudged
        .map((name) => {
          const person = duePeople.find((p) => p.name === name);
          return slackMention(name, person?.slackHandle ?? null);
        })
        .join(", ");
      await postToSlack(
        `⏰ It's ${NUDGE_HOUR}:00 for ${mentions} and there's no output logged for today yet — a quick /log entry keeps the streak going.`
      );
    }

    return NextResponse.json({ ok: true, nudged });
  } catch (error) {
    console.error("Nudge job failed:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ ok: false, error: "Nudge job failed." }, { status: 500 });
  }
}
