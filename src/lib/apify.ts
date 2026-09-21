import { ApifyClient } from "apify-client";
import { env } from "./env";

/**
 * The ONE generic Apify helper.
 *
 * Every scraper in this app — X posts, LinkedIn posts, website crawl, news
 * search, peer posts — calls `runActor` with a different actor ID and input.
 * Nothing else in the codebase talks to Apify directly.
 */

export type RunActorOptions = {
  /** Stop after this many result items. Pay-per-result actors bill per item, so this caps cost. */
  maxItems?: number;
  /** Hard stop for the actor run, in seconds. Most scrapes finish in 30–90s. Default 180. */
  timeoutSecs?: number;
  /** Refuse to spend more than this many US dollars on one run (pay-per-event actors only). */
  maxChargeUsd?: number;
  /** Memory for the actor's container in MB. Leave unset to use the actor's default. */
  memoryMb?: number;
};

export type ActorResult<T> = {
  items: T[];
  runId: string;
  status: string;
  costUsd: number | null;
  durationSecs: number | null;
  consoleUrl: string;
};

export class ApifyError extends Error {}

export async function runActor<T = Record<string, unknown>>(
  actorId: string,
  input: Record<string, unknown>,
  options: RunActorOptions = {},
): Promise<ActorResult<T>> {
  const token = env("APIFY_TOKEN");
  if (!token) {
    throw new ApifyError("APIFY_TOKEN is missing. Paste it into the .env file, then try again.");
  }

  const client = new ApifyClient({ token });
  const timeoutSecs = options.timeoutSecs ?? 180;

  // `call` starts the actor and waits until the run finishes (or hits the timeout).
  let run;
  try {
    run = await client.actor(actorId).call(input, {
      timeout: timeoutSecs,
      waitSecs: timeoutSecs + 30,
      maxItems: options.maxItems,
      maxTotalChargeUsd: options.maxChargeUsd,
      memory: options.memoryMb,
    });
  } catch (err) {
    throw translateApifyError(err, actorId);
  }

  const consoleUrl = `https://console.apify.com/actors/runs/${run.id}`;

  // TIMED-OUT runs usually still produced useful partial results, so we keep them.
  if (run.status !== "SUCCEEDED" && run.status !== "TIMED-OUT") {
    const detail = run.statusMessage ? `: ${run.statusMessage}` : "";
    throw new ApifyError(`Apify actor "${actorId}" ended with status ${run.status}${detail}. Details: ${consoleUrl}`);
  }

  const { items } = await client.dataset(run.defaultDatasetId).listItems({
    limit: options.maxItems,
    clean: true,
  });

  return {
    items: items as T[],
    runId: run.id,
    status: run.status,
    costUsd: typeof run.usageTotalUsd === "number" ? run.usageTotalUsd : null,
    durationSecs: typeof run.stats?.runTimeSecs === "number" ? run.stats.runTimeSecs : null,
    consoleUrl,
  };
}

/** Turns Apify's API errors into messages a non-engineer can act on. */
function translateApifyError(err: unknown, actorId: string): Error {
  const e = err as { statusCode?: number; type?: string; message?: string };
  const status = typeof e?.statusCode === "number" ? e.statusCode : null;
  const type = typeof e?.type === "string" ? e.type : "";
  const message = err instanceof Error ? err.message : String(err);

  if (status === 401 || type === "user-or-token-not-found") {
    return new ApifyError(
      "Apify rejected the token in .env (APIFY_TOKEN). Create a new token at https://console.apify.com/settings/integrations, paste it into .env, and try again.",
    );
  }
  if (status === 404 || type === "record-not-found") {
    return new ApifyError(`Apify could not find an actor called "${actorId}". Check APIFY_X_ACTOR in .env.`);
  }
  if (status === 402 || status === 403 || /credit|payment|plan|paid/i.test(message)) {
    return new ApifyError(
      `Apify would not run "${actorId}": ${message}. This usually means the account is out of credit or the actor needs a paid Apify plan.`,
    );
  }
  if (status === 400 || type === "invalid-input") {
    return new ApifyError(`Apify rejected the input we sent to "${actorId}": ${message}`);
  }
  return err instanceof Error ? err : new ApifyError(message);
}
