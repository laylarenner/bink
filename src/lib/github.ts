/**
 * Reads a person's public GitHub activity with GitHub's free REST API.
 * We read repo names, descriptions, READMEs, commit messages and PR titles —
 * never the code itself.
 *
 * Works without a token (60 requests/hour). Add GITHUB_TOKEN to .env for
 * 5,000 requests/hour.
 */

import { env } from "./env";

const API = "https://api.github.com";

export type GithubUser = {
  login: string;
  name: string | null;
  bio: string | null;
  company: string | null;
  location: string | null;
  blog: string | null;
  twitter: string | null;
  followers: number;
  publicRepos: number;
  createdAt: string;
  url: string;
};

export type GithubRepo = {
  name: string;
  fullName: string;
  url: string;
  description: string | null;
  homepage: string | null;
  language: string | null;
  topics: string[];
  stars: number;
  forks: number;
  archived: boolean;
  createdAt: string;
  pushedAt: string;
  /** Cleaned README excerpt. Only filled for the top-ranked repos. */
  readme: string | null;
  /** First lines of their own recent commit messages. Only for top-ranked repos. */
  commitMessages: string[];
  /** Titles of recent pull requests in the repo. Only for top-ranked repos. */
  pullRequestTitles: string[];
};

export type ExternalPullRequest = {
  title: string;
  repo: string;
  url: string;
  state: string;
  createdAt: string;
};

export type GithubData = {
  user: GithubUser;
  /** Ranked most-relevant first. The first `detailedRepoCount` entries include README, commits and PRs. */
  repos: GithubRepo[];
  detailedRepoCount: number;
  forkCount: number;
  /** PRs they opened on repositories they do not own. */
  externalPullRequests: ExternalPullRequest[];
  fetchedAt: string;
  usedToken: boolean;
};

type RawUser = {
  login: string;
  name: string | null;
  bio: string | null;
  company: string | null;
  location: string | null;
  blog: string | null;
  twitter_username: string | null;
  followers: number;
  public_repos: number;
  created_at: string;
  html_url: string;
};

type RawRepo = {
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  homepage: string | null;
  language: string | null;
  topics?: string[];
  stargazers_count: number;
  forks_count: number;
  fork: boolean;
  archived: boolean;
  created_at: string;
  pushed_at: string;
};

type RawCommit = { commit: { message: string } };
type RawPull = { title: string };
type RawSearchIssue = {
  title: string;
  html_url: string;
  state: string;
  created_at: string;
  repository_url: string;
};

export class GithubError extends Error {}

function buildHeaders(raw: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: raw ? "application/vnd.github.raw+json" : "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "content-strategist-local-app",
  };
  const token = env("GITHUB_TOKEN");
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function gh<T>(
  path: string,
  opts: { raw?: boolean; optional?: boolean } = {},
): Promise<T | null> {
  const res = await fetch(`${API}${path}`, { headers: buildHeaders(!!opts.raw), cache: "no-store" });

  if (res.ok) {
    return (opts.raw ? await res.text() : await res.json()) as T;
  }

  // 404 = no README / no such thing, 409 = empty repository, 451 = blocked repo.
  if (opts.optional && (res.status === 404 || res.status === 409 || res.status === 451)) {
    return null;
  }

  if ((res.status === 403 || res.status === 429) && res.headers.get("x-ratelimit-remaining") === "0") {
    const reset = Number(res.headers.get("x-ratelimit-reset"));
    const at = reset ? new Date(reset * 1000).toLocaleTimeString() : "within the hour";
    throw new GithubError(
      `GitHub's hourly request limit is used up. It resets at ${at}. ` +
        `Add a GITHUB_TOKEN to .env to raise the limit from 60 to 5,000 requests per hour.`,
    );
  }

  if (res.status === 404) {
    throw new GithubError(`GitHub returned "not found" for ${path}.`);
  }

  const body = (await res.text()).slice(0, 200);
  throw new GithubError(`GitHub API error ${res.status} on ${path}: ${body}`);
}

function firstLine(message: string): string {
  return (message.split("\n")[0] ?? "").trim();
}

function unique(list: string[]): string[] {
  return Array.from(new Set(list.filter(Boolean)));
}

/** Strips badges, images, HTML and code blocks so the model reads prose, then caps the length. */
export function cleanReadme(text: string, max = 3500): string {
  let t = text
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/```[\s\S]*?```/g, "[code sample omitted]")
    .replace(/<[^>]+>/g, " ")
    .replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (t.length > max) t = t.slice(0, max).trimEnd() + " …";
  return t;
}

function toRepo(
  r: RawRepo,
  extra: { readme: string | null; commitMessages: string[]; pullRequestTitles: string[] },
): GithubRepo {
  return {
    name: r.name,
    fullName: r.full_name,
    url: r.html_url,
    description: r.description,
    homepage: r.homepage || null,
    language: r.language,
    topics: r.topics ?? [],
    stars: r.stargazers_count,
    forks: r.forks_count,
    archived: r.archived,
    createdAt: r.created_at,
    pushedAt: r.pushed_at,
    ...extra,
  };
}

/** Higher score = more worth reading in depth. Stars matter, recent activity matters. */
function relevanceScore(r: RawRepo): number {
  const ageDays = (Date.now() - new Date(r.pushed_at).getTime()) / 86_400_000;
  const recency = Math.max(0, 730 - ageDays) / 730; // 1.0 = pushed today, 0 = two+ years ago
  return Math.log1p(r.stargazers_count) * 2 + recency * 3 + (r.description ? 0.5 : 0) + (r.archived ? -1 : 0);
}

export async function fetchGithub(username: string): Promise<GithubData> {
  const u = encodeURIComponent(username);
  const usedToken = Boolean(env("GITHUB_TOKEN"));

  let rawUser: RawUser | null;
  try {
    rawUser = await gh<RawUser>(`/users/${u}`);
  } catch (err) {
    if (err instanceof GithubError && err.message.includes("not found")) {
      throw new GithubError(`There is no GitHub user named "${username}". Check the spelling.`);
    }
    throw err;
  }
  if (!rawUser) throw new GithubError(`There is no GitHub user named "${username}".`);

  const rawRepos = (await gh<RawRepo[]>(`/users/${u}/repos?per_page=100&sort=pushed&type=owner`)) ?? [];
  const ownRepos = rawRepos.filter((r) => !r.fork);
  const forkCount = rawRepos.length - ownRepos.length;

  const ranked = [...ownRepos].sort((a, b) => relevanceScore(b) - relevanceScore(a));

  // Without a token we only have 60 requests per hour, so read fewer repos in depth.
  const detailLimit = Number(env("GITHUB_MAX_REPOS")) || (usedToken ? 12 : 8);
  const detailedRaw = ranked.slice(0, detailLimit);
  const lightRaw = ranked.slice(detailLimit, detailLimit + 40);

  const detailed = await Promise.all(
    detailedRaw.map(async (r) => {
      const [readme, commits, pulls] = await Promise.all([
        gh<string>(`/repos/${r.full_name}/readme`, { raw: true, optional: true }),
        gh<RawCommit[]>(`/repos/${r.full_name}/commits?per_page=25&author=${u}`, { optional: true }),
        gh<RawPull[]>(`/repos/${r.full_name}/pulls?state=all&per_page=10&sort=updated&direction=desc`, {
          optional: true,
        }),
      ]);
      return toRepo(r, {
        readme: readme ? cleanReadme(readme) : null,
        commitMessages: unique(
          (commits ?? []).map((c) => firstLine(c.commit.message)).filter((m) => !/^merge\b/i.test(m)),
        ).slice(0, 20),
        pullRequestTitles: unique((pulls ?? []).map((p) => p.title)),
      });
    }),
  );

  const light = lightRaw.map((r) => toRepo(r, { readme: null, commitMessages: [], pullRequestTitles: [] }));

  // Pull requests they opened on other people's projects. Search has its own rate
  // limit, so a failure here is not fatal.
  let externalPullRequests: ExternalPullRequest[] = [];
  try {
    const q = encodeURIComponent(`author:${username} type:pr -user:${username}`);
    const search = await gh<{ items: RawSearchIssue[] }>(
      `/search/issues?q=${q}&sort=updated&order=desc&per_page=30&advanced_search=true`,
    );
    externalPullRequests = (search?.items ?? []).map((i) => ({
      title: i.title,
      repo: i.repository_url.replace("https://api.github.com/repos/", ""),
      url: i.html_url,
      state: i.state,
      createdAt: i.created_at,
    }));
  } catch (err) {
    console.warn("[github] external PR search skipped:", err instanceof Error ? err.message : err);
  }

  return {
    user: {
      login: rawUser.login,
      name: rawUser.name,
      bio: rawUser.bio,
      company: rawUser.company,
      location: rawUser.location,
      blog: rawUser.blog || null,
      twitter: rawUser.twitter_username,
      followers: rawUser.followers,
      publicRepos: rawUser.public_repos,
      createdAt: rawUser.created_at,
      url: rawUser.html_url,
    },
    repos: [...detailed, ...light],
    detailedRepoCount: detailed.length,
    forkCount,
    externalPullRequests,
    fetchedAt: new Date().toISOString(),
    usedToken,
  };
}

/** Compact plain-text version of the GitHub data that we hand to the model. */
export function githubDigest(data: GithubData): string {
  const { user } = data;
  const lines: string[] = [];
  const ym = (d: string) => new Date(d).toISOString().slice(0, 7);

  lines.push(`GITHUB PROFILE @${user.login}`);
  lines.push(
    [
      user.name ? `Name: ${user.name}` : null,
      user.bio ? `Bio: ${user.bio}` : null,
      user.company ? `Company (self-reported): ${user.company}` : null,
      user.location ? `Location (self-reported): ${user.location}` : null,
      user.blog ? `Website: ${user.blog}` : null,
      user.twitter ? `X handle listed: @${user.twitter}` : null,
      `Followers: ${user.followers}`,
      `Public repos: ${user.publicRepos} (${data.forkCount} are forks of other projects and were skipped)`,
      `On GitHub since: ${ym(user.createdAt)}`,
    ]
      .filter(Boolean)
      .join("\n"),
  );

  lines.push("");
  lines.push(`TOP REPOSITORIES (read in depth, ranked by relevance):`);
  data.repos.slice(0, data.detailedRepoCount).forEach((r, i) => {
    lines.push("");
    lines.push(
      `${i + 1}. ${r.name} — ${r.description ?? "(no description)"}` +
        ` | ${r.language ?? "language unknown"} | ${r.stars} stars | created ${ym(r.createdAt)}, last push ${ym(r.pushedAt)}` +
        (r.archived ? " | ARCHIVED" : "") +
        (r.topics.length ? ` | topics: ${r.topics.join(", ")}` : "") +
        (r.homepage ? ` | site: ${r.homepage}` : ""),
    );
    if (r.readme) lines.push(`   README excerpt:\n${indent(r.readme, "   | ")}`);
    if (r.commitMessages.length) {
      lines.push(`   Their recent commit messages:`);
      r.commitMessages.forEach((m) => lines.push(`   - ${m}`));
    }
    if (r.pullRequestTitles.length) {
      lines.push(`   Pull request titles in this repo:`);
      r.pullRequestTitles.forEach((t) => lines.push(`   - ${t}`));
    }
  });

  const rest = data.repos.slice(data.detailedRepoCount);
  if (rest.length) {
    lines.push("");
    lines.push(`OTHER REPOSITORIES (name — description — last push):`);
    rest.forEach((r) => lines.push(`- ${r.name} — ${r.description ?? "(no description)"} — ${ym(r.pushedAt)}`));
  }

  if (data.externalPullRequests.length) {
    lines.push("");
    lines.push(`PULL REQUESTS THEY OPENED ON OTHER PEOPLE'S PROJECTS:`);
    data.externalPullRequests.forEach((p) =>
      lines.push(`- "${p.title}" on ${p.repo} (${p.state}, ${ym(p.createdAt)})`),
    );
  }

  return lines.join("\n");
}

function indent(text: string, prefix: string): string {
  return text
    .split("\n")
    .map((l) => prefix + l)
    .join("\n");
}
