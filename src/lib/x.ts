import { runActor } from "./apify";
import { env } from "./env";

/**
 * Fetches a person's recent X posts through Apify and normalises them into a
 * simple shape. The actor is configurable via APIFY_X_ACTOR in .env.
 *
 * Supported actors (both accept `twitterHandles` + `maxItems`):
 *   - xquik/x-tweet-scraper   (default; works on Apify's free plan)
 *   - apidojo/tweet-scraper   (needs a paid Apify plan)
 */

export const DEFAULT_X_ACTOR = "xquik/x-tweet-scraper";

export type XPost = {
  id: string;
  text: string;
  url: string;
  postedAt: string | null;
  likes: number;
  reposts: number;
  replies: number;
  isReply: boolean;
  isRetweet: boolean;
  isQuote: boolean;
};

export type XData = {
  handle: string;
  actorId: string;
  posts: XPost[];
  retweetsRemoved: number;
  runId: string;
  consoleUrl: string;
  costUsd: number | null;
  fetchedAt: string;
};

type Raw = Record<string, unknown>;

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}
function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : 0;
}
function bool(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}
function obj(v: unknown): Raw | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : null;
}

function parseDate(v: unknown): string | null {
  if (typeof v === "number") return new Date(v > 1e12 ? v : v * 1000).toISOString();
  const s = str(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Maps one raw actor item to an XPost. Tolerates the field names of both supported actors. */
/** True if, after stripping links, there is no actual text left (an image/video-only tweet). */
export function isLinkOnlyText(text: string): boolean {
  return text.replace(/https?:\/\/\S+/g, "").trim().length === 0;
}

export function normalizeTweet(item: Raw, fallbackHandle: string): XPost | null {
  // apidojo's free "demo mode" returns fake placeholder tweets — skip them.
  if (item.type === "mock_tweet") return null;

  const text = str(item.fullText) ?? str(item.full_text) ?? str(item.text);
  const id = str(item.id) ?? str(item.id_str) ?? str(item.tweetId);
  if (!text || !id || isLinkOnlyText(text)) return null;

  const author = obj(item.author);
  const username =
    str(author?.userName) ?? str(author?.username) ?? str(author?.screen_name) ?? str(item.authorUsername) ?? fallbackHandle;

  const isRetweet = bool(item.isRetweet) ?? (Boolean(item.retweeted_status) || /^RT @/i.test(text));
  const isReply = bool(item.isReply) ?? Boolean(item.inReplyToId ?? item.in_reply_to_status_id ?? item.inReplyToUserId);
  const isQuote = bool(item.isQuote) ?? bool(item.isQuoteStatus) ?? Boolean(item.quoted_tweet ?? item.quote);

  return {
    id,
    text,
    url: str(item.url) ?? str(item.twitterUrl) ?? `https://x.com/${username}/status/${id}`,
    postedAt: parseDate(item.createdAt ?? item.created_at ?? item.timestamp),
    likes: num(item.likeCount ?? item.favoriteCount ?? item.favorite_count),
    reposts: num(item.retweetCount ?? item.retweet_count),
    replies: num(item.replyCount ?? item.reply_count),
    isReply,
    isRetweet,
    isQuote,
  };
}

export async function fetchXPosts(handle: string, maxItems = 100): Promise<XData> {
  const actorId = env("APIFY_X_ACTOR") || DEFAULT_X_ACTOR;

  const result = await runActor<Raw>(
    actorId,
    { twitterHandles: [handle], maxItems },
    { maxItems, timeoutSecs: 300, maxChargeUsd: 1 },
  );

  const seen = new Set<string>();
  const all: XPost[] = [];
  for (const item of result.items) {
    const post = normalizeTweet(item, handle);
    if (!post || seen.has(post.id)) continue;
    seen.add(post.id);
    all.push(post);
  }

  const posts = all
    .filter((p) => !p.isRetweet)
    .sort((a, b) => (b.postedAt ?? "").localeCompare(a.postedAt ?? ""));

  if (posts.length === 0) {
    const mockCount = result.items.filter((i) => i.type === "mock_tweet").length;
    if (mockCount > 0) {
      throw new Error(
        `The actor "${actorId}" is running in demo mode and only returns placeholder tweets on Apify's free plan. ` +
          `Switch APIFY_X_ACTOR in .env to ${DEFAULT_X_ACTOR} or upgrade your Apify plan.`,
      );
    }
    throw new Error(
      `The X scraper returned no posts for @${handle}. Check the handle is right and the account is public. Run details: ${result.consoleUrl}`,
    );
  }

  return {
    handle,
    actorId,
    posts,
    retweetsRemoved: all.length - posts.length,
    runId: result.runId,
    consoleUrl: result.consoleUrl,
    costUsd: result.costUsd,
    fetchedAt: new Date().toISOString(),
  };
}

/** Compact plain-text version of the posts that we hand to the model. */
export function xDigest(data: XData): string {
  const lines: string[] = [];
  lines.push(
    `X POSTS BY @${data.handle} — ${data.posts.length} posts they wrote themselves (reposts of other people removed), newest first.`,
  );
  lines.push(`Format: (date) [likes/reposts/replies] text. "(reply)" marks a reply to someone else.`);
  lines.push("");
  for (const p of data.posts) {
    const date = p.postedAt ? p.postedAt.slice(0, 10) : "date unknown";
    const flag = p.isReply ? " (reply)" : p.isQuote ? " (quote post)" : "";
    lines.push(`- (${date}) [${p.likes}/${p.reposts}/${p.replies}]${flag} ${p.text.replace(/\s+/g, " ").trim()}`);
  }
  return lines.join("\n");
}
