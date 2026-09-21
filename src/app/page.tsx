import Link from "next/link";
import { getProfileNav } from "@/lib/profileNav";
import { env } from "@/lib/env";
import type { ProfileNavSummary } from "@/lib/profileStatus";
import HowItWorksFlow, { type FlowStep } from "@/components/HowItWorksFlow";

// Five steps, one short line each — scannable in a few seconds, not read word for word.
const HOW_IT_WORKS: FlowStep[] = [
  { tone: "coral", title: "Point us at your work", body: "GitHub, X, LinkedIn, your blog." },
  { tone: "sky", title: "Lock in your angle", body: "Bink tells your story back, you agree on 2–3 things." },
  { tone: "lilac", title: "Get ideas", body: "From your work, the news, and your peers." },
  { tone: "butter", title: "Write it in your voice", body: "Real drafts, from your real posts." },
  { tone: "sage", title: "Post it automatically", body: "Approve once. We schedule and publish it." },
];

export default async function HomePage() {
  const profiles = await getProfileNav();
  const missingKeys = [
    !env("ANTHROPIC_API_KEY") && "ANTHROPIC_API_KEY",
    !env("APIFY_TOKEN") && "APIFY_TOKEN",
  ].filter((k): k is string => Boolean(k));

  return (
    <main>
      {/*
        This app has a persistent left sidebar, so the content column here is
        NOT the full browser viewport — it's (viewport width - sidebar width).
        A vw-based "full bleed" trick measures against the real viewport and
        bleeds under the sidebar instead. The fix: don't fight the layout with
        viewport math at all. This section is a plain, full-width block of
        its own actual parent (the sidebar's flex-1 content column), so it
        fills exactly the space available here — no tricks needed.
      */}
      <section
        className="relative py-16 text-center"
        style={{
          backgroundImage: `
            radial-gradient(ellipse 60% 70% at 15% 20%, rgba(242,165,82,0.6), rgba(242,165,82,0) 70%),
            radial-gradient(ellipse 55% 65% at 85% 15%, rgba(198,65,10,0.5), rgba(198,65,10,0) 70%),
            radial-gradient(ellipse 65% 75% at 50% 90%, rgba(139,63,140,0.32), rgba(139,63,140,0) 70%),
            linear-gradient(120deg, #f2a552 0%, #e8842e 24%, #d9631a 46%, #c2410c 66%, #a6350f 84%, #8b3f8c 100%)
          `,
        }}
      >
        <div className="mx-auto max-w-4xl px-6">
          <h1 className="text-3xl font-bold tracking-tight text-white drop-shadow-sm sm:text-4xl">
            You&apos;ve built a lot. Time people heard about it.
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-base text-white/90">
            For engineers and founders with strong opinions and an empty feed. Real posts, in your real voice,
            written and published for you.
          </p>
          <Link
            href="/profile/new"
            className="mt-6 inline-block rounded-lg bg-white px-6 py-3 text-sm font-semibold text-coral-dark shadow-md transition hover:-translate-y-0.5 hover:shadow-lg"
          >
            Start a new profile →
          </Link>
        </div>
      </section>

      <div className="mx-auto max-w-4xl px-6 py-16">
        {missingKeys.length > 0 && (
          <p className="mb-8 rounded-lg border border-coral/40 bg-peach/40 px-4 py-3 text-sm text-coral-dark">
            <span className="font-semibold">Setup needed:</span> add {missingKeys.join(" and ")} to the{" "}
            <code className="rounded bg-white/70 px-1 font-mono text-xs">.env</code> file in the project folder. See
            the README for where to get each key.
          </p>
        )}

        <section className="mb-16">
          <h2 className="mb-8 text-sm font-bold uppercase tracking-wide text-ink-soft">How it works</h2>
          <HowItWorksFlow steps={HOW_IT_WORKS} />
        </section>

      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-soft">Your profiles</h2>
        {profiles.length === 0 ? (
          <p className="rounded-xl border border-dashed border-sand bg-cream-soft px-4 py-6 text-sm text-ink-soft">
            Nothing here yet. Start your first profile above.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {profiles.map((p) => (
              <ProfileCard key={p.id} {...p} />
            ))}
          </div>
        )}
        </section>
      </div>
    </main>
  );
}

function ProfileCard({ id, name, hasSources, hasSummary, hasStrategy }: ProfileNavSummary) {
  const status = !hasSources
    ? "Just getting started. Connect a source"
    : !hasSummary
      ? "Sources in. Build the profile next"
      : !hasStrategy
        ? "Profile built. Lock in the strategy next"
        : "Strategy set. Ready for ideas";

  const dotClass = !hasSources ? "bg-ink-soft/40" : !hasSummary ? "bg-sky-text" : !hasStrategy ? "bg-lilac-text" : "bg-sage-text";

  return (
    <Link
      href={`/profile/${id}`}
      className="rounded-xl border border-sand bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-coral hover:shadow-md"
    >
      <p className="font-semibold text-ink">{name}</p>
      <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-soft">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} />
        {status}
      </p>
    </Link>
  );
}
