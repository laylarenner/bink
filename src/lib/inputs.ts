/** Turns "@dhh", "https://x.com/dhh", "twitter.com/dhh/" etc. into "dhh". */
export function normalizeXHandle(raw: string): string {
  let s = raw.trim();
  if (!s) return "";
  s = s.replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, "");
  s = s.split(/[/?#]/)[0] ?? "";
  s = s.replace(/^@+/, "");
  return s.trim();
}

/** Turns "@torvalds", "https://github.com/torvalds/" etc. into "torvalds". */
export function normalizeGithubUsername(raw: string): string {
  let s = raw.trim();
  if (!s) return "";
  s = s.replace(/^https?:\/\/(www\.)?github\.com\//i, "");
  s = s.split(/[/?#]/)[0] ?? "";
  s = s.replace(/^@+/, "");
  return s.trim();
}

export const X_HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;
export const GITHUB_USERNAME_RE = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

/**
 * Turns "linkedin.com/in/jane", "https://www.linkedin.com/in/jane/?x=1" etc. into
 * "https://www.linkedin.com/in/jane/". Returns null if it is not a LinkedIn profile
 * or company URL.
 */
export function normalizeLinkedinUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const m = s.match(/^(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/(in|company)\/([^/?#]+)/i);
  if (!m) return null;
  return `https://www.linkedin.com/${m[1].toLowerCase()}/${m[2]}/`;
}
