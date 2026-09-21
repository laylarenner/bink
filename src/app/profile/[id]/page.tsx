import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getGuestId } from "@/lib/guest";
import { ProfileSummarySchema, type ProfileSummary } from "@/lib/summarize";
import ProfileDetail from "./ProfileDetail";

export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await prisma.profile.findUnique({
    where: { id },
    include: {
      sources: { orderBy: { kind: "asc" } },
      samples: { orderBy: [{ postedAt: "desc" }] },
      messages: { orderBy: { createdAt: "asc" } },
      research: { orderBy: { createdAt: "desc" } },
      ideas: { orderBy: { createdAt: "desc" }, include: { drafts: { orderBy: { createdAt: "asc" } } } },
    },
  });
  // Not found, or belongs to a different guest — either way, nothing to show.
  const guestId = await getGuestId();
  if (!profile || profile.guestId !== guestId) notFound();

  let summary: ProfileSummary | null = null;
  if (profile.summaryJson) {
    try {
      const parsed = ProfileSummarySchema.safeParse(JSON.parse(profile.summaryJson));
      summary = parsed.success ? parsed.data : null;
    } catch {
      summary = null;
    }
  }

  const handles = [
    profile.githubUsername && `github.com/${profile.githubUsername}`,
    profile.xHandle && `@${profile.xHandle}`,
    profile.linkedinUrl && profile.linkedinUrl.replace("https://www.", "").replace(/\/$/, ""),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <Link href="/" className="text-sm text-ink-soft hover:text-coral hover:underline">
        ← All profiles
      </Link>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-ink">{profile.displayName ?? "Untitled profile"}</h1>
        {handles && <p className="text-sm text-ink-soft">{handles}</p>}
      </div>

      <ProfileDetail profile={profile} summary={summary} />
    </main>
  );
}
