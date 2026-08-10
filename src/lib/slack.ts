import "server-only";

/**
 * Posts to the team's Slack Incoming Webhook (§16g). No-ops gracefully if
 * SLACK_WEBHOOK_URL isn't set — returns false rather than throwing, so
 * callers (the nudge/digest crons) can just skip and report "not configured"
 * instead of failing the whole job.
 */
export async function postToSlack(text: string): Promise<boolean> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return false;

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    throw new Error(`Slack webhook responded with ${res.status}`);
  }
  return true;
}

/**
 * A person's Slack mention if their `slackHandle` looks like a real Slack
 * user ID (starts with U/W), otherwise just their plain name (§16g) — real
 * @mentions need the admin to supply IDs via /admin's Team section
 * (the `Axisero People` "Slack Handle" field, §18a), not a hardcoded map.
 */
export function slackMention(name: string, slackHandle: string | null): string {
  if (slackHandle && /^[UW][A-Z0-9]{6,}$/i.test(slackHandle.trim())) {
    return `<@${slackHandle.trim()}>`;
  }
  return name;
}
