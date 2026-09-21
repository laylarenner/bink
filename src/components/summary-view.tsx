"use client";

import { useState } from "react";
import type { ProfileSummary } from "@/lib/summarize";

/**
 * A two-minute briefing, not an essay: headline, three short cards, the posts
 * worth writing next, and the rest folded away.
 */
export function SummaryView({ summary }: { summary: ProfileSummary }) {
  return (
    <div className="space-y-8">
      <p className="text-xl font-bold leading-snug tracking-tight text-ink">{summary.headline}</p>

      <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
        <Card tone="peach" title="What you build" text={summary.whatTheyBuild} />
        <Card tone="lilac" title="What you care about" text={summary.whatTheyCareAbout} />
        <Card tone="sky" title="How you write" text={summary.howTheyWrite} chips={summary.voiceTraits} />
      </div>

      {summary.untoldStories.length > 0 && (
        <Section tone="sage" title="Stories worth telling first" hint="Things you have built or lived through and never posted about properly.">
          <ul className="grid gap-2 sm:grid-cols-2">
            {summary.untoldStories.map((item) => (
              <li key={item} className="flex gap-2.5 rounded-xl bg-sage/30 p-3 text-sm text-ink shadow-sm">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sage-text" aria-hidden />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {summary.recurringThemes.length > 0 && (
        <Section tone="butter" title="Recurring themes">
          <ul className="flex flex-wrap gap-2">
            {summary.recurringThemes.map((t) => (
              <li key={t} className="rounded-full bg-butter/40 px-3 py-1 text-xs font-semibold text-butter-text">
                {t}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {summary.postsThatShowTheirVoice.length > 0 && (
        <Section tone="lilac" title="In your own words">
          <div className="grid gap-3 sm:grid-cols-3">
            {summary.postsThatShowTheirVoice.slice(0, 3).map((p) => (
              <blockquote key={p} className="rounded-xl bg-lilac/25 p-4 text-sm leading-relaxed text-ink shadow-sm">
                <Clamp text={p} lines={4} />
              </blockquote>
            ))}
          </div>
        </Section>
      )}

      {(summary.notableProjects.length > 0 || summary.unknowns.length > 0) && (
        <details className="group rounded-xl border-2 border-sand bg-white p-4 shadow-sm">
          <summary className="cursor-pointer text-sm font-bold text-ink group-open:mb-4">
            More detail: {[summary.notableProjects.length && `${summary.notableProjects.length} notable projects`, summary.unknowns.length && `${summary.unknowns.length} things we do not know about you`]
              .filter(Boolean)
              .join(" · ")}
          </summary>
          <div className="grid gap-6 sm:grid-cols-2">
            {summary.notableProjects.length > 0 && (
              <div>
                <h4 className="mb-2 text-sm font-bold text-coral-dark">Your notable projects</h4>
                <ul className="space-y-3">
                  {summary.notableProjects.map((p) => (
                    <li key={p.name}>
                      <p className="text-sm font-semibold text-ink">{p.name}</p>
                      <p className="text-sm text-ink">{p.story}</p>
                      <p className="text-xs text-ink-soft">From: {p.evidence}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {summary.unknowns.length > 0 && (
              <div>
                <h4 className="mb-2 text-sm font-bold text-ink-soft">What we do not know about you</h4>
                <ul className="space-y-1.5 text-sm text-ink-soft">
                  {summary.unknowns.map((u) => (
                    <li key={u}>{u}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </details>
      )}
    </div>
  );
}

const TONE: Record<string, { card: string; title: string; bar: string }> = {
  peach: { card: "bg-peach/50", title: "text-coral-dark", bar: "bg-coral" },
  lilac: { card: "bg-lilac/50", title: "text-lilac-text", bar: "bg-lilac-text" },
  sky: { card: "bg-sky/50", title: "text-sky-text", bar: "bg-sky-text" },
  sage: { card: "bg-sage/50", title: "text-sage-text", bar: "bg-sage-text" },
  butter: { card: "bg-butter/50", title: "text-butter-text", bar: "bg-butter-text" },
};

function Card({ tone, title, text, chips }: { tone: keyof typeof TONE; title: string; text: string; chips?: string[] }) {
  const t = TONE[tone];
  return (
    <div className={`rounded-xl p-5 shadow-sm ${t.card}`}>
      <h3 className={`mb-2 text-sm font-bold ${t.title}`}>{title}</h3>
      <Clamp text={text} lines={4} />
      {chips && chips.length > 0 && <Chips items={chips} />}
    </div>
  );
}

function Chips({ items }: { items: string[] }) {
  const [open, setOpen] = useState(false);
  const shown = open ? items : items.slice(0, 4);
  return (
    <ul className="mt-3 flex flex-wrap gap-1.5">
      {shown.map((c) => (
        <li key={c} className="rounded-full bg-white/80 px-2.5 py-1 text-xs font-medium text-ink">
          {c}
        </li>
      ))}
      {items.length > 4 && (
        <li>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded-full px-2.5 py-1 text-xs font-semibold text-coral-dark hover:underline"
          >
            {open ? "Less" : `+${items.length - 4} more`}
          </button>
        </li>
      )}
    </ul>
  );
}

/** Shows a few lines with a "More" toggle so long text never takes over the page. */
// Tailwind only generates classes it can see written out, so no template strings here.
const CLAMP: Record<number, string> = { 4: "line-clamp-4", 5: "line-clamp-5" };

function Clamp({ text, lines }: { text: string; lines: 4 | 5 }) {
  const [open, setOpen] = useState(false);
  const paragraphs = text.split(/\n{2,}/).filter(Boolean);
  const long = text.length > lines * 60;
  return (
    <div>
      <div className={`space-y-2 text-sm leading-relaxed text-ink ${open || !long ? "" : CLAMP[lines]}`}>
        {paragraphs.map((para, i) => (
          <p key={i}>{para}</p>
        ))}
      </div>
      {long && (
        <button type="button" onClick={() => setOpen((v) => !v)} className="mt-1.5 text-xs font-semibold text-coral-dark hover:underline">
          {open ? "Less" : "More"}
        </button>
      )}
    </div>
  );
}

function Section({
  title,
  hint,
  tone,
  children,
}: {
  title: string;
  hint?: string;
  tone: keyof typeof TONE;
  children: React.ReactNode;
}) {
  const t = TONE[tone];
  return (
    <section>
      <div className="mb-1 flex items-center gap-2">
        <span className={`h-4 w-1.5 shrink-0 rounded-full ${t.bar}`} aria-hidden />
        <h3 className="text-sm font-bold text-ink">{title}</h3>
      </div>
      {hint && <p className="mb-3 ml-3.5 text-xs text-ink-soft">{hint}</p>}
      {!hint && <div className="mb-3" />}
      {children}
    </section>
  );
}
