import { env } from "./env";

/**
 * Zernio (https://zernio.com): the service that actually connects to a
 * person's real LinkedIn and X accounts and publishes on their behalf.
 * This is the only place in the app that talks to it.
 */

const BASE = "https://zernio.com/api/v1";

function getKey(): string {
  const key = env("ZERNIO_API_KEY");
  if (!key) throw new Error("ZERNIO_API_KEY is missing. Paste it into the .env file, then try again.");
  return key;
}

export class ZernioApiError extends Error {
  status: number;
  body: Record<string, unknown> | null;

  constructor(status: number, rawBody: string) {
    super(`Zernio API error (${status}): ${rawBody.slice(0, 300)}`);
    this.status = status;
    this.body = (() => {
      try {
        return JSON.parse(rawBody);
      } catch {
        return null;
      }
    })();
  }
}

async function zFetch(pathname: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${BASE}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getKey()}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ZernioApiError(res.status, body);
  }
  return res;
}

// Bink only ever writes text posts to these two, but Zernio's connect flow
// speaks the same protocol for either, so the mapping stays general.
const PLATFORM_MAP: Record<string, string> = { linkedin: "linkedin", x: "twitter", twitter: "twitter" };

export function zernioPlatformFor(platform: string): string | null {
  return PLATFORM_MAP[platform.toLowerCase()] ?? null;
}

export { ZERNIO_CONNECT_PLATFORMS } from "./zernioShared";
import type { ZernioAccount } from "./zernioShared";
export type { ZernioAccount };

export async function listZernioAccounts(zernioProfileId: string): Promise<ZernioAccount[]> {
  const res = await zFetch(`/accounts?profileId=${encodeURIComponent(zernioProfileId)}`);
  const data = await res.json();
  const list: unknown[] = Array.isArray(data) ? data : (data.accounts ?? data.data ?? []);
  return list.map((raw) => {
    const a = raw as Record<string, unknown>;
    return {
      id: String(a._id ?? a.id),
      platform: String(a.platform),
      name: String(a.displayName ?? a.username ?? a.platform),
      username: (a.username as string | undefined) ?? null,
    };
  });
}

export async function getZernioConnectUrl(zernioProfileId: string, platform: string, redirectUrl: string): Promise<string> {
  const res = await zFetch(
    `/connect/${encodeURIComponent(platform)}?profileId=${encodeURIComponent(zernioProfileId)}&redirect_url=${encodeURIComponent(redirectUrl)}`,
  );
  const data = await res.json();
  if (!data.authUrl) throw new Error("Zernio did not return a connect URL.");
  return data.authUrl as string;
}

/** Creates a Zernio sub-profile the first time this person needs one. Never asks them for a setup code. */
export async function createZernioProfile(name: string): Promise<string> {
  try {
    const res = await zFetch(`/profiles`, { method: "POST", body: JSON.stringify({ name }) });
    const data = await res.json();
    return data.profile._id as string;
  } catch (err) {
    if (err instanceof ZernioApiError && err.status === 409) {
      const existingId = err.body?.details as { existingProfileId?: string } | undefined;
      if (existingId?.existingProfileId) return existingId.existingProfileId;
    }
    throw err;
  }
}

export async function disconnectZernioAccount(accountId: string): Promise<void> {
  await zFetch(`/accounts/${encodeURIComponent(accountId)}`, { method: "DELETE" });
}

export async function getZernioPost(postId: string): Promise<Record<string, unknown>> {
  const res = await zFetch(`/posts/${encodeURIComponent(postId)}`);
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export function extractZernioPostId(body: Record<string, unknown>): string | null {
  const direct = body._id ?? body.id;
  if (typeof direct === "string") return direct;
  const nested = body.post as Record<string, unknown> | undefined;
  const nestedId = nested?._id ?? nested?.id;
  return typeof nestedId === "string" ? nestedId : null;
}

export async function createZernioPost(params: {
  content: string;
  platform: string;
  accountId: string;
  scheduledFor?: Date | null;
}): Promise<Record<string, unknown>> {
  const { content, platform, accountId, scheduledFor } = params;
  const res = await zFetch(`/posts`, {
    method: "POST",
    body: JSON.stringify({
      content,
      platforms: [{ platform, accountId }],
      ...(scheduledFor ? { scheduledFor: scheduledFor.toISOString() } : { publishNow: true }),
    }),
  });
  try {
    return await res.json();
  } catch {
    return {};
  }
}

/**
 * Zernio's own response shape for a created post isn't documented here, so
 * this checks the handful of field names a REST API would plausibly use for
 * a live post link, at the top level and one level into "platforms"/"posts"
 * arrays, rather than assuming one exact shape.
 */
export function extractZernioPostUrl(body: Record<string, unknown>): string | null {
  const URL_KEYS = ["platformPostUrl", "publishedUrl", "url", "postUrl", "permalink", "link", "shareUrl", "publicUrl"];
  const tryObj = (o: unknown): string | null => {
    if (!o || typeof o !== "object") return null;
    const rec = o as Record<string, unknown>;
    for (const key of URL_KEYS) {
      const v = rec[key];
      if (typeof v === "string" && /^https?:\/\//.test(v)) return v;
    }
    return null;
  };
  const direct = tryObj(body);
  if (direct) return direct;
  const nested = (body.post ?? body.data) as unknown;
  const fromNested = tryObj(nested);
  if (fromNested) return fromNested;
  for (const arrKey of ["platforms", "posts", "results"]) {
    const arr = (body as Record<string, unknown>)[arrKey] ?? (nested as Record<string, unknown> | undefined)?.[arrKey];
    if (Array.isArray(arr)) {
      for (const item of arr) {
        const found = tryObj(item);
        if (found) return found;
      }
    }
  }
  return null;
}
