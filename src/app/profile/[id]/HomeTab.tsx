import Link from "next/link";
import { runSummary } from "@/app/actions";
import { RunButton } from "@/components/run-button";
import { SummaryView } from "@/components/summary-view";
import { timeAgo } from "@/lib/format";
import type { ProfileSummary } from "@/lib/summarize";
import { tabLock, type Tab } from "@/lib/profileStatus";
import type { ProfileWithSources } from "./ProfileDetail";

const NEXT_UP: { title: string; body: string; tab: Tab; cta: string }[] = [
  {
    title: "Lock in your angle",
    body: "Bink plays back the story and agrees the two or three things you should be known for.",
    tab: "Strategy",
    cta: "Open strategy →",
  },
  {
    title: "Get ideas",
    body: "From your projects, the news in your niche, and what's working for peers right now.",
    tab: "Content Ideas",
    cta: "Find ideas →",
  },
  {
    title: "Write posts",
    body: "LinkedIn and X posts in your voice, grounded in your strategy and writing samples.",
    tab: "Posts",
    cta: "Write a post →",
  },
];

export default function HomeTab({
  profile,
  summary,
  setTab,
  status,
}: {
  profile: ProfileWithSources;
  summary: ProfileSummary | null;
  setTab: (tab: Tab) => void;
  status: { hasSources: boolean; hasSummary: boolean; hasStrategy: boolean };
}) {
  const KIND_LABEL: Record<string, string> = { github: "GitHub", x: "X", linkedin: "LinkedIn" };
  const fetched = profile.sources.filter((s) => s.status === "done").map((s) => KIND_LABEL[s.kind] ?? s.kind);
  const samplesInUse = profile.samples.filter((s) => !s.excluded).length;

  return (
    <div>
      {summary ? (
        <section>
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-ink">What we learned about you</h2>
              <p className="mt-1 text-sm text-ink-soft">
                Built {timeAgo(profile.summarizedAt)} from {fetched.join(" + ") || "your sources"}
                {samplesInUse > 0 && ` · ${samplesInUse} writing samples in use`}.
              </p>
            </div>
            <RunButton
              action={runSummary.bind(null, profile.id)}
              label="Regenerate"
              pendingLabel="Rewriting…"
              hint="Claude is re-reading everything. 20–60 seconds."
              size="sm"
            />
          </div>
          <SummaryView summary={summary} />
        </section>
      ) : (
        <section className="rounded-xl border border-sand bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold tracking-tight text-ink">Sources are in. Build your profile.</h2>
          <p className="mt-1 text-sm text-ink-soft">
            We&apos;ll read everything we fetched and write a plain-English take on what you build, what you care about, and
            how you write.
          </p>
          <Link
            href={`/profile/${profile.id}?tab=Sources`}
            scroll={false}
            className="mt-4 inline-block rounded-lg bg-coral px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-coral-dark"
          >
            Go to Sources →
          </Link>
        </section>
      )}

      <section className="mt-10">
        <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-ink-soft">Next up</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {NEXT_UP.map((step) => {
            const lock = tabLock(step.tab, status);
            return (
              <button
                key={step.title}
                onClick={() => setTab(step.tab)}
                disabled={Boolean(lock)}
                title={lock ?? undefined}
                className={`rounded-xl border border-sand bg-white p-4 text-left shadow-sm transition ${
                  lock ? "cursor-not-allowed opacity-60" : "hover:border-coral hover:shadow-md"
                }`}
              >
                <h4 className="font-semibold text-ink">{step.title}</h4>
                <p className="mt-1 text-xs text-ink-soft">{step.body}</p>
                <p className="mt-2 text-xs font-semibold text-coral-dark">{lock ? `🔒 ${lock}` : step.cta}</p>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
