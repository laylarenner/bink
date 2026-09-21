import type { WritingSample } from "@prisma/client";

export type SamplePlatform = "x" | "linkedin";

export const PLATFORM_LABEL: Record<string, string> = { x: "X", linkedin: "LinkedIn", blog: "Blog" };

/** How many posts per platform we hand to the model. Strongest first, so the cap rarely bites. */
const DIGEST_CAP = 150;

/**
 * Plain-text digest of the writing samples we hand to the model.
 * Excluded posts (personal, or left out by the user) never appear here.
 * Ordered by founder signal, then engagement, so the revealing posts come first.
 */
export function samplesDigest(samples: WritingSample[], platform: SamplePlatform, authorLabel: string): string | null {
  const used = samples.filter((s) => s.platform === platform && !s.excluded);
  if (used.length === 0) return null;

  const sorted = [...used].sort(
    (a, b) => b.signal - a.signal || b.likes + b.reposts - (a.likes + a.reposts) || (b.postedAt?.getTime() ?? 0) - (a.postedAt?.getTime() ?? 0),
  );
  const kept = sorted.slice(0, DIGEST_CAP);
  const strong = kept.filter((s) => s.signal >= 3).length;

  const lines: string[] = [];
  lines.push(
    `${PLATFORM_LABEL[platform].toUpperCase()} POSTS BY ${authorLabel}: ${kept.length} posts they wrote themselves (reposts and personal posts left out)${kept.length < used.length ? `, the ${kept.length} most revealing of ${used.length}` : ""}.`,
  );
  lines.push(
    `Ordered by how much each post says about them as a builder or business person: signal 3 = about their own work or business (${strong} posts), 2 = professional opinion, 1 = thin. Within a level, most engaged first.`,
  );
  lines.push(
    platform === "x"
      ? `Format: (date) [signal] [likes/reposts/replies] text. "(reply)" marks a reply to someone else.`
      : `Format: (date) [signal] [likes/reposts/comments] text.`,
  );
  lines.push("");
  for (const p of kept) {
    const date = p.postedAt ? p.postedAt.toISOString().slice(0, 10) : "date unknown";
    const flag = p.isReply ? " (reply)" : "";
    lines.push(`- (${date}) [${p.signal}] [${p.likes}/${p.reposts}/${p.replies}]${flag} ${p.text.replace(/\s+/g, " ").trim()}`);
  }
  return lines.join("\n");
}
