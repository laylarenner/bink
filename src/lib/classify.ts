import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { env } from "./env";
import { MODEL, REFUSAL_FALLBACK_BETA } from "./summarize";

/**
 * Scores freshly scraped posts for how much they say about the person as a
 * builder or business person, and flags personal ones so holiday snaps never
 * become writing samples. Personal posts stay in the database, marked excluded.
 */

const VerdictsSchema = z.object({
  decisions: z.array(
    z.object({
      id: z.string().describe("The post id exactly as given in square brackets."),
      signal: z
        .number()
        .int()
        .min(0)
        .max(3)
        .describe("0 personal, 1 thin professional, 2 professional opinion or industry talk, 3 directly about their own business, product, work decisions or lessons."),
      reason: z.string().describe("Three to eight plain words."),
    }),
  ),
});

export type Verdict = { professional: boolean; signal: number; reason: string };

const SYSTEM_PROMPT = `You score one person's social media posts for a personal-brand tool used by founders and software engineers. The goal: find the posts that explain who this person is as a builder or business person, and drop the personal ones.

Score each post 0 to 3:
3 = directly about their own business, product, launch, customers, numbers, work decisions, lessons learned, or their career story.
2 = professional opinion or industry talk: takes on business, tech, marketing, startups, work culture, other companies.
1 = professional but thin: short thank-yous to customers, bare announcements, replies about work with little substance.
0 = personal: travel, holidays, restaurants, food, drinks, family, relationships, pets, sports, fitness, health, hobbies, celebrations, memes and jokes unrelated to work, everyday life updates.
Borderline cases (a work trip, a life lesson tied to their job, a joke about their industry): at least 1.

Return exactly one decision per post id, using the ids given. Do not invent ids. Reasons are three to eight plain words, no em dashes.`;

const CHUNK = 120;

export async function classifyPosts(
  posts: { id: string; text: string }[],
  ctx: { displayName: string | null; platform: string },
): Promise<Map<string, Verdict>> {
  const verdicts = new Map<string, Verdict>();
  if (posts.length === 0) return verdicts;

  const apiKey = env("ANTHROPIC_API_KEY");
  if (!apiKey) {
    console.warn("[classify] no ANTHROPIC_API_KEY, keeping every post");
    return verdicts;
  }

  const workspaceId = env("ANTHROPIC_WORKSPACE_ID");
  const client = new Anthropic({
    apiKey,
    defaultHeaders: workspaceId ? { "anthropic-workspace-id": workspaceId } : undefined,
  });

  const chunks: { id: string; text: string }[][] = [];
  for (let i = 0; i < posts.length; i += CHUNK) chunks.push(posts.slice(i, i + CHUNK));

  await Promise.all(
    chunks.map(async (chunk, index) => {
      const body =
        `PERSON: ${ctx.displayName ?? "unknown"}\nPLATFORM: ${ctx.platform}\n\nPOSTS:\n` +
        chunk.map((p) => `[${p.id}] ${p.text.replace(/\s+/g, " ").trim().slice(0, 700)}`).join("\n\n");
      try {
        const response = await client.beta.messages.parse({
          model: MODEL,
          max_tokens: 16000,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: body }],
          betas: [REFUSAL_FALLBACK_BETA],
          fallbacks: "default",
          output_config: { format: betaZodOutputFormat(VerdictsSchema), effort: "low" },
        });
        if (response.stop_reason === "max_tokens" || !response.parsed_output) {
          console.warn(`[classify] chunk ${index + 1} incomplete (stop=${response.stop_reason}), keeping those posts`);
          return;
        }
        const known = new Set(chunk.map((p) => p.id));
        for (const d of response.parsed_output.decisions) {
          if (known.has(d.id)) verdicts.set(d.id, { professional: d.signal >= 1, signal: d.signal, reason: d.reason });
        }
        console.info(`[classify] chunk ${index + 1}/${chunks.length}: ${chunk.length} posts, in=${response.usage.input_tokens} out=${response.usage.output_tokens}`);
      } catch (err) {
        // Never block a scrape on the classifier; the user can still curate by hand.
        console.warn(`[classify] chunk ${index + 1} skipped:`, err instanceof Error ? err.message : err);
      }
    }),
  );

  const personal = [...verdicts.values()].filter((v) => !v.professional).length;
  console.info(`[classify] ${posts.length} posts scored: ${personal} personal, ${[...verdicts.values()].filter((v) => v.signal === 3).length} strong`);
  return verdicts;
}
