import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { env } from "./env";
import { MODEL, REFUSAL_FALLBACK_BETA } from "./summarize";

/**
 * The strategy chat. One tool call per turn ("save_strategy") is how the
 * conversation writes back to the profile - the model decides when there is
 * enough to save, never the UI.
 */

export const PillarSchema = z.object({
  name: z.string().describe("Two to five words."),
  description: z.string().describe("One sentence, under 20 words, addressed as 'you'."),
});

export const SaveStrategyInput = z.object({
  positioning: z
    .string()
    .describe("One or two sentences addressed as 'you': the angle. What you are known for and why it is credible, from your own material."),
  pillars: z.array(PillarSchema).min(1).max(4).describe("The 2 to 4 things you should be known for."),
  topics: z.array(z.string()).describe("5 to 12 concrete, specific things you could post about right now, each under 12 words."),
  audience: z.string().optional().describe("One sentence, under 20 words: who this is for."),
});
export type SaveStrategyInput = z.infer<typeof SaveStrategyInput>;

export const SAVE_STRATEGY_TOOL: Anthropic.Beta.Messages.BetaTool = {
  name: "save_strategy",
  description:
    "Saves the locked-in strategy to the profile. Call this once you and the user agree on positioning and 2 to 4 pillars, not before. Calling it again replaces the previous strategy with the new one.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      positioning: { type: "string" },
      pillars: {
        type: "array",
        items: {
          type: "object",
          properties: { name: { type: "string" }, description: { type: "string" } },
          required: ["name", "description"],
          additionalProperties: false,
        },
      },
      topics: { type: "array", items: { type: "string" } },
      audience: { type: "string" },
    },
    required: ["positioning", "pillars", "topics"],
    additionalProperties: false,
  },
};

const SYSTEM_PROMPT = `You are Bink, a content strategist helping one person (a software engineer or startup founder) figure out what they should be known for, so they can start posting. If they ask your name, you're Bink. Do not introduce yourself by name unprompted in every message; it's your identity, not a script.

You already have a plain-English profile of them built from their GitHub and social posts. Use it. Never ask them to repeat what it already tells you.

You are consultative, not a blank-page interviewer. Never open with a broad question like "what do you want to be known for?" or "what do you want to share about?" and wait for them to fill in a blank page. Instead, tell them what you see and recommend, then ask them to react to it.

Open the conversation (your first message) like this, addressed to them as 'you':
1. Play back the story in one or two sentences: not their tech stack, the human story ("You spent three years building X and never told anyone").
2. Say plainly: "Here's what I think you should share about:" and list 2 to 3 specific, concrete angles pulled from their profile (a real project, a real theme, a real quote), each in one sentence. These are recommendations, not a menu of vague categories.
3. Ask exactly ONE sharp, specific question to confirm or narrow it down: "Does the [X] angle feel right, or is there something else pulling at you?" Not an open invitation to brainstorm from scratch.

Every later reply follows the same shape: lead with what you think based on what they just said (a recommendation, a specific pillar, a specific topic), then ask at most one sharp question to confirm or narrow it, rather than asking them to generate ideas from nothing. If they mention a topic, rule ("never mention my old company"), file, or link, use it immediately in your next recommendation rather than just acknowledging it.

Ground every claim in their profile, their own messages, or anything they upload or you research. Never invent facts about them. If they mention something not in the material, take their word for it and use it.

Keep replies short: 2 to 5 sentences, conversational. No lists unless they ask for one. No em dashes. No AI-sounding phrases (delve, tapestry, testament to, game-changer, unlock, leverage, seamless, landscape, journey).

Only call save_strategy when the strategy itself is new or has actually changed (new or updated positioning, pillars, or topics). A plain question from them ("what should I post first?", "why that pillar?") gets a plain text answer, using the strategy you already saved as context. Do not call save_strategy just because a strategy already exists.

When you do call save_strategy, fill in everything (unchanged fields included), then in the SAME turn go on to answer whatever they actually asked, in one or two sentences, after the tool result comes back.`;

export type StrategyTurnResult = {
  reply: string;
  saved: SaveStrategyInput | null;
  model: string;
};

export type StrategyChatMessage = { role: "user" | "assistant"; content: string };

export async function runStrategyTurn(
  profileContext: string,
  history: StrategyChatMessage[],
): Promise<StrategyTurnResult> {
  const apiKey = env("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is missing. Paste it into the .env file, then try again.");
  const workspaceId = env("ANTHROPIC_WORKSPACE_ID");
  const client = new Anthropic({ apiKey, defaultHeaders: workspaceId ? { "anthropic-workspace-id": workspaceId } : undefined });

  const messages: Anthropic.Beta.Messages.BetaMessageParam[] = history.map((m) => ({ role: m.role, content: m.content }));

  const system = `${SYSTEM_PROMPT}\n\n=== THEIR PROFILE ===\n${profileContext}`;
  let saved: SaveStrategyInput | null = null;
  let lastModel = MODEL;

  // Claude's tool-use protocol is two steps: it calls save_strategy (stop_reason
  // "tool_use"), we run it and hand back a tool_result, and only THEN does it write
  // the conversational reply. Stopping after step one (which this used to do) meant
  // a genuine question like "what should I post about first?" got silently replaced
  // by a canned "Saved your strategy." — the model never got to answer it.
  for (let turn = 0; turn < 3; turn++) {
    let response: Anthropic.Beta.Messages.BetaMessage;
    try {
      response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 4000,
        system,
        messages,
        tools: [SAVE_STRATEGY_TOOL],
        betas: [REFUSAL_FALLBACK_BETA],
        fallbacks: "default",
      });
    } catch (err) {
      throw translateError(err);
    }
    lastModel = response.model;

    if (response.stop_reason === "refusal") {
      throw new Error("The strategist declined to answer that. Try rephrasing.");
    }

    const text = response.content
      .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    const toolUse = response.content.find(
      (b): b is Anthropic.Beta.Messages.BetaToolUseBlock => b.type === "tool_use" && b.name === "save_strategy",
    );

    if (!toolUse) {
      return { reply: text || "...", saved, model: lastModel };
    }

    const parsed = SaveStrategyInput.safeParse(toolUse.input);
    const toolResultText = parsed.success
      ? "Saved. Continue the conversation normally now — answer whatever they actually asked, in plain text."
      : `Could not save that: ${parsed.error.message}. Try again or just answer in plain text.`;
    if (parsed.success) saved = parsed.data;

    // Feed the tool result back so the model finishes its turn with real text.
    messages.push(
      { role: "assistant", content: response.content },
      { role: "user", content: [{ type: "tool_result", tool_use_id: toolUse.id, content: toolResultText }] },
    );
  }

  // Exhausted the loop without a text reply (the model kept calling the tool). Rare,
  // but never show a fabricated line — tell the truth about what happened.
  return { reply: "Saved, but I did not manage to reply after that. Ask your question again?", saved, model: lastModel };
}

function translateError(err: unknown): Error {
  if (err instanceof Anthropic.AuthenticationError) {
    return new Error("Anthropic rejected the API key in .env (ANTHROPIC_API_KEY). Check it, then try again.");
  }
  if (err instanceof Anthropic.BadRequestError && /workspace/i.test(err.message)) {
    return new Error(
      "Anthropic says this API key is not tied to a workspace. Add ANTHROPIC_WORKSPACE_ID to .env, or create a key scoped to a workspace.",
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
