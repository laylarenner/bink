import fs from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";

/**
 * Reads secrets from this project's `.env` file — and lets that file WIN over
 * whatever the shell that launched the server happened to have exported.
 *
 * Why: Next.js never overrides an existing environment variable with `.env`,
 * so a stale `export APIFY_TOKEN=…` in ~/.zshrc would silently beat the fresh
 * token pasted into `.env`. Re-read on every call, so editing `.env` takes
 * effect without restarting the dev server.
 */

export type EnvKey =
  | "ANTHROPIC_API_KEY"
  | "ANTHROPIC_WORKSPACE_ID"
  | "APIFY_TOKEN"
  | "APIFY_X_ACTOR"
  | "APIFY_LINKEDIN_ACTOR"
  | "APIFY_LINKEDIN_SEARCH_ACTOR"
  | "APIFY_GOOGLE_ACTOR"
  | "ZERNIO_API_KEY"
  | "GITHUB_TOKEN"
  | "GITHUB_MAX_REPOS";

function readDotEnv(): Record<string, string | undefined> {
  try {
    return parseEnv(fs.readFileSync(path.join(process.cwd(), ".env"), "utf8"));
  } catch {
    return {};
  }
}

/** Value from `.env` if set there, otherwise from the process environment. Empty → undefined. */
export function env(key: EnvKey): string | undefined {
  const fromFile = readDotEnv()[key]?.trim();
  if (fromFile) return fromFile;
  const fromProcess = process.env[key]?.trim();
  return fromProcess || undefined;
}
