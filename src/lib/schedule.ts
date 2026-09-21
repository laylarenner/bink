/**
 * "Best time to post" — v1. No posting history exists yet to learn from, so
 * this is a sensible published-research default per platform, not a
 * personalized prediction. Revisit once there is enough post-performance
 * data on file to actually learn from.
 */

const DEFAULT_HOUR: Record<string, number> = { linkedin: 9, x: 12 };

/** The next weekday at the platform's default hour, always at least 10 minutes from now. */
export function nextBestTime(platform: string, from: Date = new Date()): Date {
  const hour = DEFAULT_HOUR[platform] ?? 10;
  const candidate = new Date(from);
  candidate.setHours(hour, 0, 0, 0);

  if (candidate.getTime() - from.getTime() < 10 * 60 * 1000) {
    candidate.setDate(candidate.getDate() + 1);
  }
  while (candidate.getDay() === 0 || candidate.getDay() === 6) {
    candidate.setDate(candidate.getDate() + 1);
  }
  return candidate;
}
