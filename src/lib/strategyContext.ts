import type { Profile, ResearchItem, Upload } from "@prisma/client";
import { ProfileSummarySchema, summaryToText } from "./summarize";

/**
 * Builds the block of context the strategist reads before every chat turn:
 * the profile summary, plus anything uploaded and any research kept so far.
 * Kept separate from summarize.ts because this one is small and cheap to
 * rebuild on every turn, while summarize.ts does the expensive one-time read.
 */
export function buildStrategyContext(profile: Profile, uploads: Upload[], research: ResearchItem[]): string {
  const parts: string[] = [];

  if (profile.summaryJson) {
    const parsed = safeJson(profile.summaryJson);
    const result = ProfileSummarySchema.safeParse(parsed);
    if (result.success) parts.push(summaryToText(result.data));
  }
  if (!parts.length && profile.summary) parts.push(profile.summary);
  if (!parts.length) parts.push("(No profile summary yet. Work only from what they tell you in chat.)");

  if (profile.notes) parts.push(`=== NOTES THEY GAVE US ===\n${profile.notes}`);

  if (uploads.length > 0) {
    parts.push(
      `=== FILES THEY UPLOADED ===\n` +
        uploads.map((u) => `--- ${u.name} ---\n${u.text}`).join("\n\n"),
    );
  }

  const kept = research.filter((r) => r.status === "kept");
  if (kept.length > 0) {
    parts.push(
      `=== RESEARCH THEY KEPT ===\n` +
        kept
          .map((r) => (r.kind === "article" ? `[article] "${r.title}" (${r.author}): ${r.text}` : `[peer post, ${r.platform}] ${r.author ?? "unknown"}: ${r.text}`))
          .join("\n\n"),
    );
  }

  return parts.join("\n\n");
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
