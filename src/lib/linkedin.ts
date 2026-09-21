import { runActor } from "./apify";
import { env } from "./env";

/**
 * Fetches a person's LinkedIn posts through Apify. The actor is configurable via
 * APIFY_LINKEDIN_ACTOR in .env. Default: harvestapi/linkedin-profile-posts
 * (no login cookies needed, about $2 per 1,000 posts).
 */

export const DEFAULT_LINKEDIN_ACTOR = "harvestapi/linkedin-profile-posts";

export type LinkedinPost = {
  id: string;
  text: string;
  url: string;
  postedAt: string | null;
  likes: number;
  comments: number;
  shares: number;
  isRepost: boolean;
};

export type LinkedinData = {
  profileUrl: string;
  actorId: string;
  posts: LinkedinPost[];
  repostsRemoved: number;
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
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return 0;
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

export function normalizeLinkedinPost(item: Raw): LinkedinPost | null {
  // When reactions/comments are scraped they arrive as separate items; we only want posts.
  if (typeof item.type === "string" && item.type !== "post") return null;

  const text = str(item.content) ?? str(item.text) ?? str(item.commentary);
  const url = str(item.linkedinUrl) ?? str(item.url) ?? str(item.postUrl);
  if (!text) return null;

  const idFromUrl = url?.match(/activity[-:](\d+)/)?.[1] ?? null;
  const id = str(item.id) ?? str(item.urn) ?? idFromUrl ?? url;
  if (!id) return null;

  const postedAt = obj(item.postedAt);
  const engagement = obj(item.engagement);
  const isRepost = Boolean(item.isRepost ?? item.repost ?? item.resharedPost ?? item.repostedPost);

  return {
    id,
    text,
    url: url ?? "",
    postedAt: parseDate(postedAt?.timestamp ?? postedAt?.date ?? item.postedAt ?? item.date),
    likes: num(engagement?.likes ?? item.likes ?? item.numLikes),
    comments: num(engagement?.comments ?? item.comments ?? item.numComments),
    shares: num(engagement?.shares ?? item.shares ?? item.numShares),
    isRepost,
  };
}

export async function fetchLinkedinPosts(profileUrl: string, maxPosts = 50): Promise<LinkedinData> {
  const actorId = env("APIFY_LINKEDIN_ACTOR") || DEFAULT_LINKEDIN_ACTOR;

  const result = await runActor<Raw>(
    actorId,
    {
      targetUrls: [profileUrl],
      maxPosts,
      includeReposts: false,
      includeQuotePosts: true,
      scrapeReactions: false,
      scrapeComments: false,
    },
    { maxItems: maxPosts, timeoutSecs: 300, maxChargeUsd: 1 },
  );

  const seen = new Set<string>();
  const all: LinkedinPost[] = [];
  for (const item of result.items) {
    const post = normalizeLinkedinPost(item);
    if (!post || seen.has(post.id)) continue;
    seen.add(post.id);
    all.push(post);
  }
  const posts = all.filter((p) => !p.isRepost).sort((a, b) => (b.postedAt ?? "").localeCompare(a.postedAt ?? ""));

  if (posts.length === 0) {
    throw new Error(
      `The LinkedIn scraper returned no posts for ${profileUrl}. Check the URL is a public profile with posts. Run details: ${result.consoleUrl}`,
    );
  }

  return {
    profileUrl,
    actorId,
    posts,
    repostsRemoved: all.length - posts.length,
    runId: result.runId,
    consoleUrl: result.consoleUrl,
    costUsd: result.costUsd,
    fetchedAt: new Date().toISOString(),
  };
}
