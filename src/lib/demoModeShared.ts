/**
 * Client-safe demo-mode flag. Zero server-only imports (no `env.ts`, no
 * `node:fs`), so both client and server components can read it directly —
 * see zernioShared.ts for why that boundary matters here.
 *
 * True only on the public GitHub-linked deployment: disables real posting
 * and caps how many expensive (Anthropic/Apify) actions one guest can run.
 */
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

export const DEMO_DAILY_LIMIT = Number(process.env.NEXT_PUBLIC_DEMO_DAILY_LIMIT ?? "30");
