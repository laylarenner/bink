import Anthropic from "@anthropic-ai/sdk";
import { env } from "./env";
import { MODEL, REFUSAL_FALLBACK_BETA } from "./summarize";

/**
 * Writes one finished post from a content idea. Plain text, not structured
 * output — post copy is creative writing, not data, and a JSON wrapper would
 * only get in the way.
 *
 * Two rules matter more than anything else here:
 *   - Never repeat something they have already posted (checked against a
 *     digest of their actual past posts).
 *   - Never lift a peer's phrasing. Only the underlying angle carries over;
 *     the words have to be theirs.
 */

export type DraftPlatform = "linkedin" | "x";

const SYSTEM_PROMPT = `You write one finished, ready-to-publish social post for a software engineer or startup founder, using a content strategist tool. You write AS them, in first person, matching their real voice exactly.

You will get: the idea to write from, their voice (real past posts and observed voice traits), a list of things they have already posted (so you never repeat one), their locked strategy, and, if this idea reacts to a specific peer's post, a warning not to copy it.

Rules, in order of importance:
1. Never repeat a post they have already made. Check the "ALREADY POSTED" list. If the idea overlaps with something already covered, find the new detail, update, or angle that has not been said yet, rather than restating it. This is the most important rule.
2. Treat any "always call it X" instruction in their strategy as absolute. X is the ONLY way that thing may ever be referred to, in the whole post, no exceptions. This means no product category, no material, no descriptive noun standing in for it either, not even once, not even self-deprecating or in passing. Example: "always call it my first business" forbids saying what it made or sold, in any phrasing, anywhere in the post. If a story genuinely needs that detail, use the exact required phrase again instead of the specific detail. Re-read your finished draft once and check this rule specifically before finishing.
3. If this idea came from a peer's post, write a genuinely new post in the person's own voice and words. Never reuse the peer's phrasing, sentence structure, or specific turns of phrase, even loosely. Only the underlying topic or angle may carry over. If in doubt, write something that reads nothing like the peer's post.
4. No emojis, anywhere, ever. Not one. This overrides anything the voice samples do with emojis.
5. Match their real voice from the samples otherwise: sentence length, hashtag habits, tone, how they open and close a post, what they capitalize or don't. Sound like them, not like generic startup-LinkedIn or generic tech-Twitter.
6. Ground every claim in the idea and their material. Never invent facts, numbers, or details not given to you.
7. Keep it tight. X: 1 to 3 short lines, never more, no thread. LinkedIn: 80 to 150 words, short paragraphs, a real hook in the first line since that's what shows before "see more". If you are ever unsure, cut, don't add.
8. No em dashes. No cringe, no AI-sounding phrasing: never use delve, tapestry, testament to, ever-evolving, game-changer, unlock, leverage, seamless, landscape, journey, or the pattern "not just X, but Y".
9. Output ONLY the post text. No preamble, no markdown fences, no "Here's a draft:", no explanation before or after.`;

export type DraftInput = {
  idea: { title: string; angle: string; evidence: string; source: string; sourceTitle: string | null };
  platform: DraftPlatform;
  displayName: string | null;
  voiceSamples: string[]; // full text of real past posts on this platform, for voice
  alreadyPosted: string[]; // short openers of past posts (any platform), for dedup
  voiceTraits: string[];
  strategyText: string | null;
  instruction?: string; // optional: "make it shorter", "add X", from a manual regenerate
};

export async function generateDraft(input: DraftInput): Promise<{ text: string; model: string }> {
  const apiKey = env("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is missing. Paste it into the .env file, then try again.");
  const workspaceId = env("ANTHROPIC_WORKSPACE_ID");
  const client = new Anthropic({ apiKey, defaultHeaders: workspaceId ? { "anthropic-workspace-id": workspaceId } : undefined });

  const sections: string[] = [];
  if (input.displayName) sections.push(`PERSON: ${input.displayName}`);
  sections.push(`PLATFORM: ${input.platform === "linkedin" ? "LinkedIn" : "X"}`);

  sections.push(
    [
      `=== THE IDEA ===`,
      `Title: ${input.idea.title}`,
      `Angle: ${input.idea.angle}`,
      `Evidence: ${input.idea.evidence}`,
      input.idea.source === "peer" ? `SOURCE: a peer's post (${input.idea.sourceTitle ?? "unknown"}). Do not copy their phrasing. Rule 2 applies.` : null,
      input.idea.source === "news" ? `SOURCE: a news article (${input.idea.sourceTitle ?? "unknown"}). Write their own take, not a summary of the article.` : null,
    ]
      .filter(Boolean)
      .join("\n"),
  );

  sections.push(
    input.voiceTraits.length ? `=== HOW THEY WRITE ===\n${input.voiceTraits.map((t) => `- ${t}`).join("\n")}` : `=== HOW THEY WRITE ===\n(no traits captured yet)`,
  );

  sections.push(
    input.voiceSamples.length
      ? `=== REAL PAST POSTS ON ${input.platform.toUpperCase()} (match this voice exactly) ===\n${input.voiceSamples.map((s, i) => `${i + 1}. ${s}`).join("\n\n")}`
      : `=== REAL PAST POSTS ===\n(none on this platform yet — match the voice traits above instead)`,
  );

  sections.push(
    input.alreadyPosted.length
      ? `=== ALREADY POSTED (do not repeat any of these) ===\n${input.alreadyPosted.map((h) => `- ${h}`).join("\n")}`
      : `=== ALREADY POSTED ===\n(nothing on record)`,
  );

  if (input.strategyText) sections.push(`=== THEIR STRATEGY ===\n${input.strategyText}`);
  if (input.instruction) sections.push(`=== WHAT TO CHANGE FROM THE LAST DRAFT ===\n${input.instruction}`);

  sections.push(`Write the post now, following the rules.`);

  let response;
  try {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: sections.join("\n\n") }],
      betas: [REFUSAL_FALLBACK_BETA],
      fallbacks: "default",
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      throw new Error("Anthropic rejected the API key in .env (ANTHROPIC_API_KEY). Check it, then try again.");
    }
    if (err instanceof Anthropic.APIError) {
      throw new Error(`Anthropic API error ${err.status ?? ""}: ${err.message}`);
    }
    throw err instanceof Error ? err : new Error(String(err));
  }

  if (response.stop_reason === "refusal") throw new Error("The model declined to write that. Try rephrasing the idea.");

  const text = response.content
    .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim()
    .replace(/^```[a-z]*\n?/i, "")
    .replace(/```$/, "")
    .trim();

  if (!text) throw new Error("The model returned an empty draft. Try again.");
  return { text, model: response.model };
}
