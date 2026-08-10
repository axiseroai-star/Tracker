import "server-only";

/**
 * Minimal in-memory fixed-window rate limiter. Good enough to stop naive
 * brute-forcing of the single shared app password (§4b) — not meant to
 * survive across cold starts/instances, which is an acceptable trade-off
 * for a 7-person internal tool.
 */

const buckets = new Map<string, { count: number; windowStart: number }>();

export function isRateLimited(
  key: string,
  { limit = 5, windowMs = 60_000 }: { limit?: number; windowMs?: number } = {}
): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStart >= windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return false;
  }

  bucket.count += 1;
  return bucket.count > limit;
}

/** Best-effort client identifier from request headers (works behind Vercel's proxy). */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}
