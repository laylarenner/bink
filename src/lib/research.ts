import Anthropic from "@anthropic-ai/sdk";
import { runActor } from "./apify";
import { env } from "./env";
import { normalizeLinkedinPost, DEFAULT_LINKEDIN_ACTOR } from "./linkedin";
import { isLinkOnlyText, normalizeTweet, DEFAULT_X_ACTOR } from "./x";
import { MODEL, REFUSAL_FALLBACK_BETA } from "./summarize";

/**
 * Research that feeds the strategy and, later, the idea cards.
 * Two jobs, both through the one generic Apify helper:
 *   - peers:   what people in the same space are posting (X + LinkedIn)
 *   - news:    articles, blogs and news in the niche (Google Search)
 */

export const DEFAULT_LINKEDIN_SEARCH_ACTOR = "unseenuser/linkedin-post-seach-scraper";
export const DEFAULT_GOOGLE_ACTOR = "apify/google-search-scraper";

export type ResearchHit = {
  kind: "peer_post" | "article";
  platform: "x" | "linkedin" | "web";
  query: string;
  title: string | null;
  text: string;
  url: string;
  author: string | null;
  likes: number;
  comments: number;
  publishedAt: string | null;
};

export type ResearchOutcome = {
  hits: ResearchHit[];
  /** One line per source that failed, so a single broken actor never hides the rest. */
  problems: string[];
};

type Raw = Record<string, unknown>;

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
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
function dedupe(hits: ResearchHit[]): ResearchHit[] {
  const seen = new Set<string>();
  return hits.filter((h) => {
    if (!h.url || seen.has(h.url)) return false;
    seen.add(h.url);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Peers
// ---------------------------------------------------------------------------
export type PeerQuery = { keywords: string[]; xHandles: string[]; linkedinUrls: string[] };

export async function searchPeerPosts(q: PeerQuery): Promise<ResearchOutcome> {
  const jobs: { label: string; run: () => Promise<ResearchHit[]> }[] = [];
  const xActor = env("APIFY_X_ACTOR") || DEFAULT_X_ACTOR;
  const liPostsActor = env("APIFY_LINKEDIN_ACTOR") || DEFAULT_LINKEDIN_ACTOR;
  const liSearchActor = env("APIFY_LINKEDIN_SEARCH_ACTOR") || DEFAULT_LINKEDIN_SEARCH_ACTOR;

  if (q.keywords.length > 0) {
    jobs.push({
      label: "X keyword search",
      run: async () => {
        const r = await runActor<Raw>(
          xActor,
          { searchTerms: q.keywords, maxItems: 40, queryType: "Top" },
          { maxItems: 40, timeoutSecs: 240, maxChargeUsd: 0.5 },
        );
        return r.items.flatMap((item) => tweetToHit(item, q.keywords.join(", ")));
      },
    });
    jobs.push({
      label: "LinkedIn keyword search",
      run: async () => {
        const r = await runActor<Raw>(
          liSearchActor,
          { mode: "search", searchKeywords: q.keywords, maxResults: 30, sortBy: "relevance", datePosted: "3months" },
          { maxItems: 30, timeoutSecs: 240, maxChargeUsd: 0.5 },
        );
        return r.items.flatMap((item) => linkedinSearchToHit(item, q.keywords.join(", ")));
      },
    });
  }
  if (q.xHandles.length > 0) {
    jobs.push({
      label: "X peer accounts",
      run: async () => {
        const r = await runActor<Raw>(
          xActor,
          { twitterHandles: q.xHandles, maxItems: 30 * q.xHandles.length },
          { maxItems: 30 * q.xHandles.length, timeoutSecs: 300, maxChargeUsd: 0.5 },
        );
        return r.items.flatMap((item) => tweetToHit(item, q.xHandles.map((h) => `@${h}`).join(", ")));
      },
    });
  }
  if (q.linkedinUrls.length > 0) {
    jobs.push({
      label: "LinkedIn peer accounts",
      run: async () => {
        const r = await runActor<Raw>(
          liPostsActor,
          { targetUrls: q.linkedinUrls, maxPosts: 15, includeReposts: false, includeQuotePosts: true, scrapeReactions: false, scrapeComments: false },
          { maxItems: 15 * q.linkedinUrls.length, timeoutSecs: 300, maxChargeUsd: 0.5 },
        );
        return r.items.flatMap((item) => {
          const post = normalizeLinkedinPost(item);
          if (!post || post.isRepost) return [];
          const author = obj(item.author);
          return [
            {
              kind: "peer_post" as const,
              platform: "linkedin" as const,
              query: q.linkedinUrls.join(", "),
              title: null,
              text: post.text,
              url: post.url || `linkedin:${post.id}`,
              author: str(author?.name) ?? str(author?.fullName) ?? null,
              likes: post.likes,
              comments: post.comments,
              publishedAt: post.postedAt,
            },
          ];
        });
      },
    });
  }

  return runJobs(jobs, (a, b) => b.likes + b.comments - (a.likes + a.comments));
}

function tweetToHit(item: Raw, query: string): ResearchHit[] {
  const post = normalizeTweet(item, "");
  if (!post || post.isRetweet || post.isReply) return [];
  // normalizeTweet already drops link-only text, kept here as a second guard for callers that pass raw items differently.
  const author = obj(item.author);
  const handle = str(author?.userName) ?? str(author?.username) ?? str(item.authorUsername);
  return [
    {
      kind: "peer_post",
      platform: "x",
      query,
      title: null,
      text: post.text,
      url: post.url,
      author: handle ? `@${handle}` : (str(author?.name) ?? null),
      likes: post.likes,
      comments: post.replies,
      publishedAt: post.postedAt,
    },
  ];
}

function linkedinSearchToHit(item: Raw, query: string): ResearchHit[] {
  const text = str(item.content) ?? str(item.text);
  const url = str(item.linkedinUrl) ?? str(item.url) ?? str(item.postUrl);
  if (!text || !url || isLinkOnlyText(text)) return [];
  const author = obj(item.author);
  const engagement = obj(item.engagement);
  const postedAt = obj(item.postedAt);
  return [
    {
      kind: "peer_post",
      platform: "linkedin",
      query,
      title: null,
      text,
      url,
      author: str(author?.name) ?? str(author?.fullName) ?? null,
      likes: num(engagement?.likes ?? item.likes),
      comments: num(engagement?.comments ?? item.comments),
      publishedAt: parseDate(postedAt?.timestamp ?? postedAt?.date ?? item.postedAt),
    },
  ];
}

// ---------------------------------------------------------------------------
// News, blogs, articles
// ---------------------------------------------------------------------------
const SOCIAL_DOMAINS = /(^|\.)(linkedin|x|twitter|facebook|instagram|tiktok|youtube|reddit|pinterest)\.com$/i;

export async function searchNews(keywords: string[], opts: { perQuery?: number; sinceDays?: number } = {}): Promise<ResearchOutcome> {
  if (keywords.length === 0) return { hits: [], problems: [] };
  const actor = env("APIFY_GOOGLE_ACTOR") || DEFAULT_GOOGLE_ACTOR;
  const perQuery = opts.perQuery ?? 10;
  const days = opts.sinceDays ?? 30;

  const jobs = [
    {
      label: "Google search",
      run: async () => {
        const r = await runActor<Raw>(
          actor,
          {
            queries: keywords.join("\n"),
            maxPagesPerQuery: 1,
            resultsPerPage: perQuery,
            languageCode: "en",
            countryCode: "us",
            quickDateRange: `d${days}`,
          },
          { maxItems: keywords.length, timeoutSecs: 180, maxChargeUsd: 0.5 },
        );
        const hits: ResearchHit[] = [];
        for (const page of r.items) {
          const term = str(obj(page.searchQuery)?.term) ?? keywords[0];
          const organic = Array.isArray(page.organicResults) ? (page.organicResults as Raw[]) : [];
          for (const res of organic) {
            const url = str(res.url);
            const title = str(res.title);
            if (!url || !title) continue;
            let host = "";
            try {
              host = new URL(url).hostname.replace(/^www\./, "");
            } catch {
              continue;
            }
            if (SOCIAL_DOMAINS.test(host)) continue;
            hits.push({
              kind: "article",
              platform: "web",
              query: term,
              title,
              text: str(res.description) ?? "",
              url,
              author: host,
              likes: 0,
              comments: 0,
              publishedAt: parseDate(res.date),
            });
          }
        }
        return hits;
      },
    },
  ];
  return runJobs(jobs, () => 0);
}

async function runJobs(
  jobs: { label: string; run: () => Promise<ResearchHit[]> }[],
  sort: (a: ResearchHit, b: ResearchHit) => number,
): Promise<ResearchOutcome> {
  const settled = await Promise.allSettled(jobs.map((j) => j.run()));
  const hits: ResearchHit[] = [];
  const problems: string[] = [];
  settled.forEach((s, i) => {
    if (s.status === "fulfilled") hits.push(...s.value);
    else problems.push(`${jobs[i].label}: ${s.reason instanceof Error ? s.reason.message : String(s.reason)}`);
  });
  return { hits: dedupe(hits).sort(sort), problems };
}

// ---------------------------------------------------------------------------
// Peer discovery: "who is even posting about this?" before "scrape their posts"
// ---------------------------------------------------------------------------
export type PeerCandidate = {
  platform: "x" | "linkedin";
  handle: string; // X: bare handle. LinkedIn: profile URL (what we need to scrape it later).
  displayName: string;
  sampleText: string;
  sampleUrl: string;
  postsSeen: number;
  totalEngagement: number;
};

const GROUND_QUERY_SYSTEM = `You turn a description of "who counts as a peer" into concrete search phrases for a literal keyword search on X and LinkedIn.

The description can be vague or relational (e.g. "competitors", "people like me", "rivals") and means nothing on its own to a keyword search engine — it has to be grounded in the person's real business, given below, so the phrases actually match posts and bios from real people in that specific space. "Competitors" for a car wash booking app is not the same search as "competitors" for a candle brand.

Output 2 to 4 short phrases only, one per line, no numbering, no bullets, no explanation. Each phrase should be 1 to 4 words, the kind of term a real person would use to describe their own role or niche in a bio or post, not a sentence. If the description already names a concrete, specific role (e.g. "GTM marketers"), keep it close to as given instead of inventing something else.`;

/**
 * A raw "who counts as a peer" query can be a vague relational word
 * ("competitors", "people like me") that a literal keyword search has no
 * hope of matching sensibly — it needs grounding in what this specific
 * person's business actually is first. Falls back to a naive split on any
 * missing key or API failure, so a broken call never blocks the search.
 */
export async function groundPeerSearchTerms(query: string, profileSummary: string | null): Promise<string[]> {
  const fallback = query.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 4);
  const apiKey = env("ANTHROPIC_API_KEY");
  if (!apiKey || !profileSummary) return fallback;

  try {
    const workspaceId = env("ANTHROPIC_WORKSPACE_ID");
    const client = new Anthropic({ apiKey, defaultHeaders: workspaceId ? { "anthropic-workspace-id": workspaceId } : undefined });
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 200,
      system: GROUND_QUERY_SYSTEM,
      messages: [{ role: "user", content: `THEIR BUSINESS:\n${profileSummary}\n\nWHO THEY SAID COUNTS AS A PEER:\n${query}` }],
      betas: [REFUSAL_FALLBACK_BETA],
      fallbacks: "default",
    });
    if (response.stop_reason === "refusal") return fallback;
    const text = response.content
      .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    const lines = text
      .split("\n")
      .map((l) => l.replace(/^[-*\d.\s]+/, "").trim())
      .filter(Boolean);
    return lines.length ? lines.slice(0, 4) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Runs a light keyword search (same actors as searchPeerPosts, smaller sample)
 * and groups the results by author, so the user picks WHO to watch before we
 * spend a full per-profile scrape on them.
 */
export async function discoverPeerProfiles(keywords: string[]): Promise<{ candidates: PeerCandidate[]; problems: string[] }> {
  if (keywords.length === 0) return { candidates: [], problems: [] };

  const xActor = env("APIFY_X_ACTOR") || DEFAULT_X_ACTOR;
  const liSearchActor = env("APIFY_LINKEDIN_SEARCH_ACTOR") || DEFAULT_LINKEDIN_SEARCH_ACTOR;

  const jobs = [
    {
      label: "X keyword search",
      run: async () => {
        const r = await runActor<Raw>(
          xActor,
          { searchTerms: keywords, maxItems: 60, queryType: "Top" },
          { maxItems: 60, timeoutSecs: 240, maxChargeUsd: 0.3 },
        );
        return r.items.flatMap((item): { platform: "x"; handle: string; displayName: string; text: string; url: string; likes: number; comments: number }[] => {
          const post = normalizeTweet(item, "");
          if (!post || post.isRetweet || post.isReply) return [];
          const author = obj(item.author);
          const handle = str(author?.userName) ?? str(author?.username) ?? str(item.authorUsername);
          if (!handle) return [];
          return [
            {
              platform: "x",
              handle,
              displayName: str(author?.name) ?? handle,
              text: post.text,
              url: post.url,
              likes: post.likes,
              comments: post.replies,
            },
          ];
        });
      },
    },
    {
      label: "LinkedIn keyword search",
      run: async () => {
        const r = await runActor<Raw>(
          liSearchActor,
          { mode: "search", searchKeywords: keywords, maxResults: 30, sortBy: "relevance", datePosted: "3months" },
          { maxItems: 30, timeoutSecs: 240, maxChargeUsd: 0.3 },
        );
        return r.items.flatMap((item): { platform: "linkedin"; handle: string; displayName: string; text: string; url: string; likes: number; comments: number }[] => {
          const text = str(item.content) ?? str(item.text);
          const postUrl = str(item.linkedinUrl) ?? str(item.url) ?? str(item.postUrl);
          if (!text || !postUrl || isLinkOnlyText(text)) return [];
          const author = obj(item.author);
          const profileUrl = str(author?.url) ?? str(author?.profileUrl) ?? str(author?.publicUrl) ?? str(author?.linkedinUrl);
          const name = str(author?.name) ?? str(author?.fullName);
          if (!profileUrl || !name) return []; // no reliable profile URL to scrape later, skip as a candidate
          const engagement = obj(item.engagement);
          return [
            {
              platform: "linkedin",
              handle: profileUrl,
              displayName: name,
              text,
              url: postUrl,
              likes: num(engagement?.likes ?? item.likes),
              comments: num(engagement?.comments ?? item.comments),
            },
          ];
        });
      },
    },
  ];

  const settled = await Promise.allSettled(jobs.map((j) => j.run()));
  const problems: string[] = [];
  const byAuthor = new Map<string, PeerCandidate>();

  settled.forEach((s, i) => {
    if (s.status === "rejected") {
      problems.push(`${jobs[i].label}: ${s.reason instanceof Error ? s.reason.message : String(s.reason)}`);
      return;
    }
    for (const hit of s.value) {
      const key = `${hit.platform}:${hit.handle.toLowerCase()}`;
      const existing = byAuthor.get(key);
      const engagement = hit.likes + hit.comments;
      if (existing) {
        existing.postsSeen += 1;
        existing.totalEngagement += engagement;
        if (engagement > 0 && engagement >= existing.totalEngagement - engagement) {
          existing.sampleText = hit.text;
          existing.sampleUrl = hit.url;
        }
      } else {
        byAuthor.set(key, {
          platform: hit.platform,
          handle: hit.handle,
          displayName: hit.displayName,
          sampleText: hit.text,
          sampleUrl: hit.url,
          postsSeen: 1,
          totalEngagement: engagement,
        });
      }
    }
  });

  const candidates = [...byAuthor.values()].sort((a, b) => b.totalEngagement - a.totalEngagement || b.postsSeen - a.postsSeen).slice(0, 25);
  return { candidates, problems };
}
