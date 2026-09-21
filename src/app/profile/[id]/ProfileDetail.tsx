"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { ContentIdea, Draft, Profile, ResearchItem, Source, StrategyMessage, WritingSample } from "@prisma/client";
import type { ProfileSummary } from "@/lib/summarize";
import {
  hasSources as computeHasSources,
  hasStrategy as computeHasStrategy,
  hasSummary as computeHasSummary,
  resolveTab,
  SOURCES_TAB,
  tabLock,
  TOOL_TABS,
  type Tab,
} from "@/lib/profileStatus";
import GettingStartedChecklist from "./GettingStartedChecklist";
import HomeTab from "./HomeTab";
import SourcesTab from "./SourcesTab";
import ContentIdeasTab from "./ContentIdeasTab";
import PostsTab from "./PostsTab";
import StrategyTab from "./StrategyTab";

export type ProfileWithSources = Profile & {
  sources: Source[];
  samples: WritingSample[];
  messages: StrategyMessage[];
  research: ResearchItem[];
  ideas: (ContentIdea & { drafts: Draft[] })[];
};

export default function ProfileDetail({ profile, summary }: { profile: ProfileWithSources; summary: ProfileSummary | null }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const status = {
    hasSources: computeHasSources(profile.sources),
    hasSummary: computeHasSummary(profile),
    hasStrategy: computeHasStrategy(profile),
  };
  const tab: Tab = resolveTab(searchParams.get("tab"), status);

  function setTab(next: Tab) {
    if (tabLock(next, status)) return;
    router.replace(`/profile/${profile.id}?tab=${encodeURIComponent(next)}`, { scroll: false });
  }

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between gap-4 border-b border-sand">
        <div className="flex gap-1 overflow-x-auto">
          {TOOL_TABS.map((t) => {
            const lock = tabLock(t, status);
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                disabled={Boolean(lock)}
                title={lock ?? undefined}
                className={`whitespace-nowrap px-4 py-2 text-sm font-semibold ${
                  lock
                    ? "cursor-not-allowed text-ink-soft/40"
                    : tab === t
                      ? "border-b-2 border-coral text-coral-dark"
                      : "text-ink-soft hover:text-ink"
                }`}
              >
                {t}
              </button>
            );
          })}
        </div>
        <button
          onClick={() => setTab(SOURCES_TAB)}
          className={`shrink-0 px-2 py-2 text-xs font-semibold ${
            tab === SOURCES_TAB ? "text-coral-dark" : "text-ink-soft hover:text-ink"
          }`}
        >
          ⚙ Sources{!status.hasSources && " (required)"}
        </button>
      </div>

      <div className="py-6">
        {tab === "Home" && (
          <>
            <GettingStartedChecklist profileId={profile.id} {...status} />
            <HomeTab profile={profile} summary={summary} setTab={setTab} status={status} />
          </>
        )}
        {tab === SOURCES_TAB && <SourcesTab profile={profile} isRequired={!status.hasSources} />}
        {tab === "Strategy" && (
          <StrategyTab
            key={profile.strategyUpdatedAt?.toISOString() ?? "none"}
            profile={profile}
            messages={profile.messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))}
            research={profile.research}
          />
        )}
        {tab === "Content Ideas" && <ContentIdeasTab profileId={profile.id} ideas={profile.ideas} />}
        {tab === "Posts" && <PostsTab profileId={profile.id} ideas={profile.ideas.filter((i) => i.status === "kept")} />}
      </div>
    </div>
  );
}
