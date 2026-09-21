import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { env } from "./env";
import { MODEL, REFUSAL_FALLBACK_BETA } from "./summarize";

/**
 * Generates post-idea cards from the three sources: the person's own work and
 * strategy, news/blogs in their niche, and what peers are posting. One Claude
 * call reads all three inputs together so it can cross-reference them (an
 * angle that reacts to a specific article, a take that differs from a peer's).
 */

const IdeaSchema = z.object({
  source: z.enum(["own", "news", "peer"]),
  title: z.string().describe("A short, punchy hook. Under 12 words. Not a topic, an actual angle."),
  angle: z.string().describe("1 to 3 sentences addressed as 'you', in plain English: the actual take to write from, specific enough to draft from directly."),
  platform: z.enum(["linkedin", "x", "both"]),
  evidence: z.string().describe("Why this fits, in a few words: the project name, or the article title, or the peer's handle. No em dashes."),
  pillar: z.string().optional().describe("Which of the person's strategy pillars this serves, by name. Omit if it does not map cleanly to one."),
  sourceUrl: z.string().optional().describe("The article or peer post URL this reacts to. Omit for source='own'."),
  sourceTitle: z.string().optional().describe("The article title or peer's name/handle, for display. Omit for source='own'."),
});

const IdeasSchema = z.object({ ideas: z.array(IdeaSchema) });
export type GeneratedIdea = z.infer<typeof IdeaSchema>;

const SYSTEM_PROMPT = `You generate post ideas for one person (a software engineer or startup founder) using a content strategist tool. The reader IS this person: address them as 'you'.

You get three kinds of material:
1. Their own profile and locked-in strategy (what they build, what they care about, their positioning and pillars).
2. Recent news and blog posts in their niche.
3. Recent posts from peers in their space.

Generate ideas from ALL THREE sources, roughly balanced:
- "own" ideas: a specific angle on something they have built, lived through, or said, that the strategy or their untold-stories notes flag as worth posting about. Ground every one in a named project, story, or quote from their material. Never invent.
- "news" ideas: a specific take THEY would have on a specific article, not a summary of the article. What do they agree or disagree with, given their own experience? Reference the actual article by title.
- "peer" ideas: a specific angle informed by what a peer posted, agreeing, disagreeing, or adding their own experience. Never suggest copying a peer's post. Reference the peer by name or handle.

Rules:
1. Every idea must be specific enough to draft from directly. "Write about AI" is not an idea. "The $2,000/month agency retainer that a $20 AI subscription now replaces, and what you tell owners who feel behind" is an idea.
2. Ground every claim in the material given. Never invent facts, numbers, or stories not present in it.
3. No em dashes. No AI-sounding phrasing (delve, tapestry, testament to, game-changer, unlock, leverage, seamless, landscape, journey, not just X but Y).
4. Give each idea a platform: pick "x" for short/punchy, "linkedin" for stories with more room, "both" only when it genuinely works either way.
5. If the news or peer material is thin or repetitive, generate fewer ideas from it rather than padding. Quality over an even split.
6. Generate 8 to 14 ideas total across all three sources combined.`;

export type IdeasInput = {
  profileSummaryText: string | null;
  strategyText: string | null;
  newsDigest: string | null;
  peerDigest: string | null;
};

export async function generateIdeas(input: IdeasInput): Promise<{ ideas: GeneratedIdea[]; model: string }> {
  const apiKey = env("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is missing. Paste it into the .env file, then try again.");
  const workspaceId = env("ANTHROPIC_WORKSPACE_ID");
  const client = new Anthropic({ apiKey, defaultHeaders: workspaceId ? { "anthropic-workspace-id": workspaceId } : undefined });

  const sections: string[] = [];
  sections.push(input.profileSummaryText ? `=== PROFILE ===\n${input.profileSummaryText}` : "=== PROFILE ===\n(none yet)");
  sections.push(input.strategyText ? `=== LOCKED-IN STRATEGY ===\n${input.strategyText}` : "=== LOCKED-IN STRATEGY ===\n(not set)");
  sections.push(input.newsDigest ? `=== RECENT NEWS AND BLOGS ===\n${input.newsDigest}` : "=== RECENT NEWS AND BLOGS ===\n(none fetched yet, skip 'news' ideas)");
  sections.push(input.peerDigest ? `=== RECENT PEER POSTS ===\n${input.peerDigest}` : "=== RECENT PEER POSTS ===\n(none fetched yet, skip 'peer' ideas)");
  sections.push("Generate the ideas now, following the rules.");

  let response;
  try {
    response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: sections.join("\n\n") }],
      betas: [REFUSAL_FALLBACK_BETA],
      fallbacks: "default",
      output_config: { format: betaZodOutputFormat(IdeasSchema), effort: "medium" },
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

  if (response.stop_reason === "refusal") {
    throw new Error("The model declined to generate ideas for that. Try again.");
  }
  if (!response.parsed_output) {
    throw new Error("The model returned something we could not read as ideas. Try again.");
  }

  return { ideas: response.parsed_output.ideas, model: response.model };
}

/** Rewrites one idea card in place, following whatever the user asked for. */
export async function reviseIdea(
  current: { title: string; angle: string; platform: string; evidence: string; pillar: string | null },
  instruction: string,
): Promise<GeneratedIdea> {
  const apiKey = env("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is missing. Paste it into the .env file, then try again.");
  const workspaceId = env("ANTHROPIC_WORKSPACE_ID");
  const client = new Anthropic({ apiKey, defaultHeaders: workspaceId ? { "anthropic-workspace-id": workspaceId } : undefined });

  const RevisedSchema = IdeaSchema.omit({ source: true, sourceUrl: true, sourceTitle: true });

  const body = [
    `CURRENT IDEA`,
    `Title: ${current.title}`,
    `Angle: ${current.angle}`,
    `Platform: ${current.platform}`,
    `Evidence: ${current.evidence}`,
    current.pillar ? `Pillar: ${current.pillar}` : null,
    ``,
    `WHAT THEY WANT CHANGED`,
    instruction.trim(),
    ``,
    `Rewrite the idea following that instruction. Keep it grounded in the same evidence unless they explicitly gave you new context to use instead. Follow all the same rules as before: specific enough to draft from, no em dashes, no AI-sounding phrasing, addressed as 'you'.`,
  ]
    .filter(Boolean)
    .join("\n");

  let response;
  try {
    response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: body }],
      betas: [REFUSAL_FALLBACK_BETA],
      fallbacks: "default",
      output_config: { format: betaZodOutputFormat(RevisedSchema), effort: "low" },
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

  if (response.stop_reason === "refusal") throw new Error("The model declined to rewrite that. Try rephrasing.");
  if (!response.parsed_output) throw new Error("The model returned something we could not read. Try again.");

  return { ...response.parsed_output, source: "own" }; // source is overwritten by the caller with the idea's real source
}
