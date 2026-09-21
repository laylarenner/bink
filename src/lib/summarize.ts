import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { env } from "./env";

export const MODEL = "claude-fable-5-1";

/** Server-side refusal fallback: opt-in by default for Fable 5.1 code, per Anthropic's guidance. */
export const REFUSAL_FALLBACK_BETA = "server-side-fallback-2026-07-01";

/** The shape of the profile summary. Stored as JSON on Profile.summaryJson. */
export const ProfileSummarySchema = z.object({
  headline: z
    .string()
    .describe(
      "One sentence, under 30 words, addressed to the person as 'you', capturing who they are and what makes their work interesting. A story, not a list of technologies.",
    ),
  whatTheyBuild: z
    .string()
    .describe(
      "Plain English addressed as 'you', at most 120 words in one or two short paragraphs. What you have built and why it mattered, named specifically. Not the tech stack.",
    ),
  whatTheyCareAbout: z
    .string()
    .describe(
      "Plain English addressed as 'you', at most 90 words. The two or three things you clearly value or keep coming back to, each backed by one piece of evidence from your material.",
    ),
  howTheyWrite: z
    .string()
    .describe(
      "Plain English addressed as 'you', at most 80 words. How you sound when you write: sentence length, tone, humour, formality, emoji and hashtag habits, what you talk about and what you avoid. If there are no posts, say so in one sentence.",
    ),
  notableProjects: z.array(
    z.object({
      name: z.string(),
      story: z
        .string()
        .describe("One or two sentences addressed as 'you', under 40 words, on why this project matters, told so a non-engineer finds it interesting."),
      evidence: z.string().describe("Where this came from in a few words: README, commit messages, a post, etc."),
    }),
  ),
  recurringThemes: z
    .array(z.string())
    .describe("3 to 6 short phrases naming the topics that keep showing up across your projects and posts."),
  voiceTraits: z
    .array(z.string())
    .describe(
      "5 to 8 observations of two to six words each about how you write, usable as instructions for writing in your voice. Empty if there are no posts.",
    ),
  postsThatShowTheirVoice: z
    .array(z.string())
    .describe(
      "Exactly 3 of your own posts (or fewer if there are fewer), quoted word-for-word, that best show how you write AND show you as a builder or business person. Prefer posts marked signal 3. Never pick personal posts. Empty if there are no posts.",
    ),
  untoldStories: z
    .array(z.string())
    .describe(
      "3 to 6 things you clearly built, did or care about (from GitHub, your notes or your own posts) that you have never or rarely posted about properly. Each one sentence addressed as 'you', under 25 words. These become post ideas.",
    ),
  unknowns: z
    .array(z.string())
    .describe("Up to 5 important things about you the material does NOT tell us, each under 15 words, phrased as 'you'. Never guess at these."),
});

export type ProfileSummary = z.infer<typeof ProfileSummarySchema>;

const SYSTEM_PROMPT = `You are a content strategist who helps technical people (software engineers and startup founders) build a personal brand. You are reading everything we could gather about one person: their public GitHub activity and the posts they wrote on X and LinkedIn.

Your job: write a plain-English profile of what this person builds, what they care about, and how they write. The reader IS this person: address them directly as 'you' throughout ('You started X at 19...'). Never use their name, or 'she', 'he', 'they', for them.

Rules:
1. Only state things the material supports. Never invent employers, job titles, credentials, education, locations, motivations or opinions. When you infer something, name the evidence ("the README for X says…", "eleven of their posts mention…"). If the material does not say, put it under "unknowns".
2. Tell the story, not the stack. "Spent months building a tool for a problem most people do not know they have" beats "uses TypeScript and Postgres". Mention technologies only when they matter to the story.
3. Write for a smart non-engineer. Short sentences. Explain jargon in plain words the first time it appears.
4. Quote their posts word-for-word when you cite them. Never paraphrase inside quotation marks.
5. If the material is thin (few repos, few posts), say so plainly and keep the summary short. Do not pad.
6. Formatting: inside every text field, never type the straight double-quote character ("). When you quote someone, use typographic quotes “like this” or single quotes 'like this'. Fill in every field completely before finishing.
7. Length: this is a briefing someone reads in two minutes, not an essay. Respect every word limit in the schema. Cut anything that does not change what the reader would post.
8. Style: no em dashes (the — character) anywhere. Plain, direct sentences a smart friend would say out loud. No AI-sounding phrasing: never use 'delve', 'tapestry', 'quietly', 'a testament to', 'ever-evolving', 'game-changer', 'unlock', 'leverage', 'seamless', 'landscape', 'journey', 'passionate', or the pattern 'not just X, but Y'. No rhetorical questions. No adjectives stacked for effect.`;

export type SummarizeInput = {
  displayName: string | null;
  githubDigest: string | null;
  xDigest: string | null;
  linkedinDigest?: string | null;
  notes: string | null;
};

export type SummarizeResult = {
  summary: ProfileSummary;
  model: string;
  inputTokens: number;
  outputTokens: number;
};

export async function summarizeProfile(input: SummarizeInput): Promise<SummarizeResult> {
  const apiKey = env("ANTHROPIC_API_KEY");
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is missing. Paste it into the .env file, then try again.");
  }
  if (!input.githubDigest && !input.xDigest && !input.linkedinDigest && !input.notes) {
    throw new Error("Nothing to summarize yet. Fetch GitHub, X or LinkedIn first.");
  }

  const sections: string[] = [];
  if (input.displayName) sections.push(`PERSON: ${input.displayName}`);
  sections.push(
    input.githubDigest
      ? `=== GITHUB ===\n${input.githubDigest}`
      : `=== GITHUB ===\n(not provided: do not guess what they build beyond what their posts say)`,
  );
  const hasPosts = Boolean(input.xDigest || input.linkedinDigest);
  if (input.xDigest) sections.push(`=== X POSTS ===\n${input.xDigest}`);
  if (input.linkedinDigest) sections.push(`=== LINKEDIN POSTS ===\n${input.linkedinDigest}`);
  if (!hasPosts) {
    sections.push(`=== POSTS ===\n(no writing samples provided: do not describe their writing voice; say there are no writing samples yet)`);
  }
  if (input.notes) sections.push(`=== NOTES THEY GAVE US ===\n${input.notes}`);
  sections.push(`Write the profile now, following the rules.`);

  // Reads ANTHROPIC_API_KEY from the environment. Keys created at the organisation
  // level (not inside a workspace) must also say which workspace to bill.
  const workspaceId = env("ANTHROPIC_WORKSPACE_ID");
  const client = new Anthropic({
    apiKey,
    defaultHeaders: workspaceId ? { "anthropic-workspace-id": workspaceId } : undefined,
  });

  const hasGithub = Boolean(input.githubDigest);
  const hasX = hasPosts;
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: sections.join("\n\n") }];

  let inputTokens = 0;
  let outputTokens = 0;
  let lastProblems: string[] = [];

  // Two attempts: models occasionally derail mid-JSON (a stray quote closes a string
  // early and the rest comes back empty). We never save an incomplete profile.
  for (let attempt = 1; attempt <= 2; attempt++) {
    let response: Awaited<ReturnType<typeof runOnce>>;
    try {
      response = await runOnce(client, messages);
    } catch (err) {
      throw translateAnthropicError(err);
    }
    inputTokens += response.usage.input_tokens;
    outputTokens += response.usage.output_tokens;
    console.info(
      `[summarize] attempt ${attempt}: stop=${response.stop_reason} in=${response.usage.input_tokens} out=${response.usage.output_tokens}`,
    );

    if (response.stop_reason === "refusal") {
      const why = response.stop_details?.explanation ?? "no explanation given";
      throw new Error(`The model declined to write this summary (${why}).`);
    }
    if (response.stop_reason === "max_tokens") {
      throw new Error("The summary ran out of room before finishing. Try again.");
    }
    const summary = response.parsed_output;
    if (!summary) {
      throw new Error("The model returned something we could not read as a summary. Try again.");
    }

    lastProblems = findGaps(summary, { hasGithub, hasX });
    if (lastProblems.length === 0) {
      return { summary: removeEmDashes(summary), model: response.model, inputTokens, outputTokens };
    }

    console.warn(`[summarize] attempt ${attempt} incomplete: ${lastProblems.join("; ")}`);
    // Ask again, showing the model what went wrong.
    const rawText = response.content.find((b) => b.type === "text")?.text ?? JSON.stringify(summary);
    messages.push(
      { role: "assistant", content: rawText },
      {
        role: "user",
        content:
          `That profile came back incomplete: ${lastProblems.join("; ")}. ` +
          `Write the whole profile again from scratch, filling every field. Remember rule 6: no straight double-quote characters inside text.`,
      },
    );
  }

  throw new Error(`The model returned an incomplete profile twice (${lastProblems.join("; ")}). Wait a minute and try again.`);
}

async function runOnce(client: Anthropic, messages: Anthropic.MessageParam[]) {
  // Fable 5.1 thinks by default, so `thinking` is left out entirely (the docs warn an
  // explicit `{type: "adaptive"}` is fine too, but omitting is simplest). The SDK
  // auto-scales the request timeout for a max_tokens this large, so a plain (non-streaming)
  // call is safe here and lets us use betaZodOutputFormat's automatic parsing.
  return client.beta.messages.parse({
    model: MODEL,
    max_tokens: 32000,
    system: SYSTEM_PROMPT,
    messages,
    betas: [REFUSAL_FALLBACK_BETA],
    fallbacks: "default",
    output_config: { format: betaZodOutputFormat(ProfileSummarySchema), effort: "medium" },
  });
}

/** Safety net for rule 7: swap any em dash the model still typed for a comma. */
function removeEmDashes<T>(value: T): T {
  if (typeof value === "string") {
    return value.replace(/\s*[—–]\s*/g, ", ").replace(/,\s*,/g, ",") as T;
  }
  if (Array.isArray(value)) return value.map(removeEmDashes) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, removeEmDashes(v)])) as T;
  }
  return value;
}

/** Things a finished profile must have, given which sources we handed over. */
export function findGaps(s: ProfileSummary, has: { hasGithub: boolean; hasX: boolean }): string[] {
  const gaps: string[] = [];
  const prose: [string, string][] = [
    ["headline", s.headline],
    ["whatTheyBuild", s.whatTheyBuild],
    ["whatTheyCareAbout", s.whatTheyCareAbout],
    ["howTheyWrite", s.howTheyWrite],
  ];
  for (const [name, text] of prose) {
    if (text.trim().length < 60) gaps.push(`${name} is only ${text.trim().length} characters`);
  }
  if (s.recurringThemes.length === 0) gaps.push("recurringThemes is empty");
  if (has.hasGithub && s.notableProjects.length === 0) gaps.push("notableProjects is empty although GitHub was provided");
  if (has.hasX && s.voiceTraits.length === 0) gaps.push("voiceTraits is empty although X posts were provided");
  if (has.hasX && s.postsThatShowTheirVoice.length === 0) gaps.push("postsThatShowTheirVoice is empty although X posts were provided");
  return gaps;
}

function translateAnthropicError(err: unknown): Error {
  if (err instanceof Anthropic.AuthenticationError) {
    return new Error(
      "Anthropic rejected the API key in .env (ANTHROPIC_API_KEY). Create a key at https://console.anthropic.com/settings/keys, paste it in, and try again.",
    );
  }
  if (err instanceof Anthropic.BadRequestError && /workspace/i.test(err.message)) {
    return new Error(
      "Anthropic says this API key is not tied to a workspace. Easiest fix: in the Anthropic Console go to Settings → API keys → Create Key, and pick a workspace (\"Default\" is fine) when creating it. " +
        "Or keep this key and add ANTHROPIC_WORKSPACE_ID=<id from Settings → Workspaces> to .env. Then try again.",
    );
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new Error("Anthropic is rate-limiting us right now. Wait a minute and try again.");
  }
  if (err instanceof Anthropic.APIError) {
    return new Error(`Anthropic API error ${err.status ?? ""}: ${err.message}`);
  }
  return err instanceof Error ? err : new Error(String(err));
}

/** Plain-text version of the summary. Later steps (strategy chat, post writing) read this. */
export function summaryToText(s: ProfileSummary): string {
  const bullets = (items: string[]) => (items.length ? items.map((i) => `- ${i}`).join("\n") : "- (none)");
  return [
    `# ${s.headline}`,
    ``,
    `## What you build`,
    s.whatTheyBuild,
    ``,
    `## What you care about`,
    s.whatTheyCareAbout,
    ``,
    `## How you write`,
    s.howTheyWrite,
    ``,
    `## Your notable projects`,
    s.notableProjects.length
      ? s.notableProjects.map((p) => `- **${p.name}**: ${p.story} _(from: ${p.evidence})_`).join("\n")
      : "- (none found)",
    ``,
    `## Recurring themes`,
    bullets(s.recurringThemes),
    ``,
    `## Voice traits`,
    bullets(s.voiceTraits),
    ``,
    `## Posts that show your voice`,
    s.postsThatShowTheirVoice.length ? s.postsThatShowTheirVoice.map((p) => `> ${p}`).join("\n\n") : "(no posts yet)",
    ``,
    `## Stories you have not told yet`,
    bullets(s.untoldStories),
    ``,
    `## What we do not know about you`,
    bullets(s.unknowns),
  ].join("\n");
}
