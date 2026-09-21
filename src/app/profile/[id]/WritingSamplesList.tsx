"use client";

import { useState, useTransition } from "react";
import type { WritingSample } from "@prisma/client";
import { setSampleExcluded } from "@/app/actions";
import { shortDate } from "@/lib/format";
import { PLATFORM_LABEL } from "@/lib/samples";

/**
 * Every post we saved, with an ✕ to leave one out and "Use again" to bring it back.
 * Personal posts caught by the filter start in the "Left out" list.
 */
export default function WritingSamplesList({ samples }: { samples: WritingSample[] }) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [showAll, setShowAll] = useState(false);

  const inUse = [...samples.filter((s) => !s.excluded)].sort(
    (a, b) => b.signal - a.signal || (b.postedAt?.getTime() ?? 0) - (a.postedAt?.getTime() ?? 0),
  );
  const leftOut = samples.filter((s) => s.excluded);
  const visible = showAll ? inUse : inUse.slice(0, 12);

  function toggle(sample: WritingSample, excluded: boolean) {
    setPendingId(sample.id);
    startTransition(async () => {
      try {
        await setSampleExcluded(sample.id, excluded);
      } finally {
        setPendingId(null);
      }
    });
  }

  if (samples.length === 0) return null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wide text-ink-soft">Writing samples</h3>
        <p className="text-xs text-ink-soft">
          {inUse.length} in use{leftOut.length > 0 && ` · ${leftOut.length} left out`}
        </p>
      </div>
      <p className="mb-3 text-xs text-ink-soft">
        These teach the writer how you sound. Posts about your work come first. Click ✕ on anything that should not shape your voice.
      </p>

      <ul className="space-y-2">
        {visible.map((s) => (
          <SampleRow key={s.id} sample={s} pending={pendingId === s.id} onToggle={() => toggle(s, true)} />
        ))}
      </ul>
      {inUse.length > 12 && (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-3 text-xs font-semibold text-coral-dark hover:underline">
          {showAll ? "Show fewer" : `Show all ${inUse.length}`}
        </button>
      )}

      {leftOut.length > 0 && (
        <details className="mt-5">
          <summary className="cursor-pointer text-xs font-semibold text-ink-soft hover:text-ink">
            Left out ({leftOut.length})
          </summary>
          <ul className="mt-2 space-y-2">
            {leftOut.map((s) => (
              <SampleRow key={s.id} sample={s} pending={pendingId === s.id} onToggle={() => toggle(s, false)} excluded />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function SampleRow({
  sample,
  pending,
  onToggle,
  excluded,
}: {
  sample: WritingSample;
  pending: boolean;
  onToggle: () => void;
  excluded?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const reason =
    sample.excludeReason === "personal" ? "Left out automatically: looks personal" : sample.excludeReason === "manual" ? "You left this out" : null;

  return (
    <li
      className={`flex gap-3 rounded-xl border border-sand bg-white p-3 shadow-sm ${excluded ? "opacity-70" : ""} ${
        pending ? "animate-pulse" : ""
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-soft">
          <span className="rounded-full bg-cream-soft px-2 py-0.5 font-semibold text-ink">{PLATFORM_LABEL[sample.platform] ?? sample.platform}</span>
          {!excluded && sample.signal >= 3 && (
            <span className="rounded-full bg-sage px-2 py-0.5 font-semibold text-sage-text" title="Directly about your work or business">
              About your work
            </span>
          )}
          {sample.postedAt && <span>{shortDate(sample.postedAt)}</span>}
          <span>{sample.likes} likes</span>
          {sample.isReply && <span>reply</span>}
          {sample.url && (
            <a href={sample.url} target="_blank" rel="noreferrer" className="hover:text-coral-dark hover:underline">
              open
            </a>
          )}
        </div>
        <p
          onClick={() => setExpanded((v) => !v)}
          className={`mt-1 cursor-pointer whitespace-pre-wrap text-sm text-ink ${expanded ? "" : "line-clamp-3"}`}
          title={expanded ? "Click to collapse" : "Click to read the whole post"}
        >
          {sample.text}
        </p>
        {excluded && reason && <p className="mt-1 text-xs text-ink-soft">{reason}</p>}
      </div>
      {excluded ? (
        <button
          type="button"
          onClick={onToggle}
          disabled={pending}
          className="shrink-0 self-start rounded-lg border border-sand px-2.5 py-1 text-xs font-semibold text-ink transition hover:border-coral hover:text-coral-dark disabled:opacity-50"
        >
          Use again
        </button>
      ) : (
        <button
          type="button"
          onClick={onToggle}
          disabled={pending}
          aria-label="Leave this post out"
          title="Leave this post out"
          className="flex h-7 w-7 shrink-0 items-center justify-center self-start rounded-full text-ink-soft transition hover:bg-rose/10 hover:text-rose disabled:opacity-50"
        >
          ✕
        </button>
      )}
    </li>
  );
}
