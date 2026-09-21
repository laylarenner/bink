import { prisma } from "./db";
import { getGuestId } from "./guest";
import { hasSources, hasStrategy, hasSummary, type ProfileNavSummary } from "./profileStatus";

/**
 * Lightweight list of profiles for the sidebar, ⌘K palette and home page
 * cards. Scoped to the current visitor's cookie, so on the public demo each
 * guest only ever sees their own profiles.
 */
export async function getProfileNav(): Promise<ProfileNavSummary[]> {
  const guestId = await getGuestId();
  const rows = await prisma.profile.findMany({
    where: { guestId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      displayName: true,
      githubUsername: true,
      xHandle: true,
      summarizedAt: true,
      pillars: true,
      positioning: true,
      sources: { select: { status: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.displayName ?? r.githubUsername ?? r.xHandle ?? "Untitled",
    hasSources: hasSources(r.sources),
    hasSummary: hasSummary(r),
    hasStrategy: hasStrategy(r),
  }));
}
