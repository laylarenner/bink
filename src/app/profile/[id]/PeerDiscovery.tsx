"use client";

import { useState, useTransition } from "react";
import { discoverPeers, scrapeSelectedPeers } from "@/app/actions";
import type { PeerCandidate } from "@/lib/research";

/**
 * One flow: say who counts as a peer, search who's actually posting like that,
 * pick the ones worth watching, then pull their full post history in one step.
 */
export default function PeerDiscovery({ profileId, initialQuery }: { profileId: string; initialQuery: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [candidates, setCandidates] = useState<PeerCandidate[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSearching, startSearching] = useTransition();
  const [scrapeResult, setScrapeResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [isScraping, startScraping] = useTransition();

  function key(c: PeerCandidate) {
    return `${c.platform}:${c.handle}`;
  }

  function search() {
    if (!query.trim()) {
      setSearchError('Say who counts as a peer, e.g. "GTM marketers, growth marketers".');
      return;
    }
    setSearchError(null);
    setScrapeResult(null);
    const fd = new FormData();
    fd.set("query", query.trim());
    startSearching(async () => {
      const result = await discoverPeers(profileId, fd);
      if (!result.ok) {
        setSearchError(result.message);
        setCandidates(null);
        return;
      }
      setCandidates(result.candidates);
      setSelected(new Set(result.candidates.slice(0, 8).map(key)));
    });
  }

  function toggle(c: PeerCandidate) {
    setSelected((prev) => {
      const next = new Set(prev);
      const k = key(c);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  function scrape() {
    if (!candidates) return;
    const picked = candidates.filter((c) => selected.has(key(c)));
    if (picked.length === 0) return;
    setScrapeResult(null);
    const fd = new FormData();
    fd.set("candidates", JSON.stringify(picked));
    startScraping(async () => {
      const result = await scrapeSelectedPeers(profileId, fd);
      setScrapeResult(result);
      if (result.ok) setCandidates(null);
    });
  }

  return (
    <div className="mb-4 rounded-lg border border-dashed border-coral/50 bg-cream-soft p-4">
      <p className="text-sm font-semibold text-ink">Not sure who to watch?</p>
      <p className="mt-0.5 text-xs text-ink-soft">Say what kind of person counts as a peer (a role, not a topic) and we&apos;ll find them.</p>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="e.g. GTM marketers, growth marketers — not developers or AI content creators"
          className="min-w-[240px] flex-1 rounded-lg border border-sand bg-white px-2.5 py-1.5 text-xs text-ink placeholder:text-ink-soft focus:border-coral focus:outline-none"
        />
        <button
          type="button"
          onClick={search}
          disabled={isSearching}
          className="shrink-0 rounded-lg border border-sand bg-white px-3 py-1.5 text-xs font-semibold text-ink shadow-sm transition hover:border-coral hover:text-coral-dark disabled:opacity-60"
        >
          {isSearching ? "Searching..." : "Find people to watch"}
        </button>
      </div>

      {isSearching && <p className="mt-2 text-xs text-ink-soft">Searching X and LinkedIn for that. 30 to 90 seconds.</p>}
      {searchError && <p className="mt-2 rounded-lg bg-rose/10 px-3 py-2 text-xs text-rose">{searchError}</p>}

      {candidates && candidates.length > 0 && (
        <div className="mt-3">
          <ul className="max-h-72 space-y-1.5 overflow-y-auto rounded-lg bg-white p-2">
            {candidates.map((c) => {
              const k = key(c);
              const checked = selected.has(k);
              return (
                <li key={k}>
                  <label className={`flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 transition ${checked ? "bg-peach/50" : "hover:bg-cream-soft"}`}>
                    <input type="checkbox" checked={checked} onChange={() => toggle(c)} className="mt-0.5 accent-coral" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="rounded-full bg-cream-soft px-1.5 py-0.5 text-[10px] font-semibold text-ink-soft">
                          {c.platform === "x" ? "X" : "LinkedIn"}
                        </span>
                        <span className="truncate text-sm font-semibold text-ink">{c.displayName}</span>
                        <span className="shrink-0 text-xs text-ink-soft">
                          {c.postsSeen} post{c.postsSeen === 1 ? "" : "s"} seen
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-1 text-xs text-ink-soft">{c.sampleText}</p>
                    </div>
                  </label>
                </li>
              );
            })}
          </ul>

          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={scrape}
              disabled={isScraping || selected.size === 0}
              className="rounded-lg bg-coral px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-coral-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isScraping ? "Pulling their posts..." : `Pull posts from ${selected.size} selected`}
            </button>
            {isScraping && <span className="text-xs text-ink-soft">1 to 2 minutes.</span>}
          </div>
        </div>
      )}

      {candidates && candidates.length === 0 && !isSearching && (
        <p className="mt-2 text-xs text-ink-soft">No one distinct turned up for that. Try different wording.</p>
      )}

      {scrapeResult && (
        <p className={`mt-3 rounded-lg px-3 py-2 text-xs ${scrapeResult.ok ? "bg-sage/50 font-semibold text-sage-text" : "bg-rose/10 text-rose"}`}>
          {scrapeResult.message}
        </p>
      )}
    </div>
  );
}
