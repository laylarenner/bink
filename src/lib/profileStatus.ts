/**
 * Where a profile is in the journey. Drives which tabs are unlocked,
 * the sidebar sub-nav, and the getting-started checklist.
 */

type SourceLike = { status: string };
type ProfileLike = {
  summarizedAt: Date | string | null;
  pillars: string | null;
  positioning: string | null;
};

/** At least one source has been fetched successfully. */
export function hasSources(sources: SourceLike[]): boolean {
  return sources.some((s) => s.status === "done");
}

/** The plain-English profile summary exists. Unlocks the Strategy tab. */
export function hasSummary(profile: ProfileLike): boolean {
  return Boolean(profile.summarizedAt);
}

/** The strategy chat has locked in positioning + pillars. Unlocks Ideas and Posts. */
export function hasStrategy(profile: ProfileLike): boolean {
  if (!profile.pillars) return false;
  try {
    const parsed = JSON.parse(profile.pillars);
    return Array.isArray(parsed) && parsed.length > 0 && Boolean(profile.positioning);
  } catch {
    return false;
  }
}

export const TOOL_TABS = ["Home", "Strategy", "Content Ideas", "Posts"] as const;
export const GATED_ON_STRATEGY = new Set<string>(["Content Ideas", "Posts"]);
export const SOURCES_TAB = "Sources";
export type Tab = (typeof TOOL_TABS)[number] | typeof SOURCES_TAB;

export type ProfileNavSummary = {
  id: string;
  name: string;
  hasSources: boolean;
  hasSummary: boolean;
  hasStrategy: boolean;
};

export function tabLock(
  tab: string,
  p: { hasSources: boolean; hasSummary: boolean; hasStrategy: boolean },
): string | null {
  if (tab === SOURCES_TAB) return null;
  if (!p.hasSources) return "Connect a source first";
  if (tab === "Home") return null;
  if (!p.hasSummary) return "Build the profile first";
  if (GATED_ON_STRATEGY.has(tab) && !p.hasStrategy) return "Lock in a strategy first";
  return null;
}

export const ALL_TABS: readonly Tab[] = [SOURCES_TAB, ...TOOL_TABS];

/** Which tab to actually show, given what the URL asked for and how far the profile has come. */
export function resolveTab(
  requested: string | null,
  p: { hasSources: boolean; hasSummary: boolean; hasStrategy: boolean },
): Tab {
  const req: Tab = ALL_TABS.includes(requested as Tab) ? (requested as Tab) : "Home";
  if (!p.hasSources) return SOURCES_TAB;
  if (tabLock(req, p)) return "Home";
  return req;
}
