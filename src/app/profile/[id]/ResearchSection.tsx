"use client";

import { useState, useTransition } from "react";
import type { ResearchItem } from "@prisma/client";
import { runNewsResearch, runPeerResearch, setResearchStatus, updatePeerAccounts } from "@/app/actions";
import PeerDiscovery from "./PeerDiscovery";
import { RunButton } from "@/components/run-button";

export default function ResearchSection({
  profileId,
  items,
  peerSearchQuery,
}: {
  profileId: string;
  items: ResearchItem[];
  peerSearchQuery: string;
}) {
  const [tab, setTab] = useState<"peers" | "news">("peers");
  const peers = items.filter((i) => i.kind === "peer_post" && i.status !== "dismissed").sort((a, b) => b.likes + b.comments - (a.likes + a.comments));
  const news = items.filter((i) => i.kind === "article" && i.status !== "dismissed");

  return (
    <div>
      <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-soft">Research</h3>
      <p className="mb-3 text-xs text-ink-soft">What&apos;s working for peers, and what&apos;s happening in your niche.</p>

      <div className="mb-4 flex gap-1">
        <TabButton active={tab === "peers"} onClick={() => setTab("peers")} label={`Peer posts${peers.length ? ` (${peers.length})` : ""}`} />
        <TabButton active={tab === "news"} onClick={() => setTab("news")} label={`News & blogs${news.length ? ` (${news.length})` : ""}`} />
      </div>

      {tab === "peers" ? (
        <PeersPanel profileId={profileId} items={peers} peerSearchQuery={peerSearchQuery} />
      ) : (
        <NewsPanel profileId={profileId} items={news} />
      )}
    </div>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
        active ? "bg-coral text-white" : "border border-sand bg-white text-ink-soft hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}

function PeersPanel({
  profileId,
  items,
  peerSearchQuery,
}: {
  profileId: string;
  items: ResearchItem[];
  peerSearchQuery: string;
}) {
  const [open, setOpen] = useState(items.length === 0);
  return (
    <div className="rounded-xl border border-sand bg-white p-4 shadow-sm">
      <PeerDiscovery profileId={profileId} initialQuery={peerSearchQuery} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-soft">Uses who counts as a peer above, plus any specific accounts you add.</p>
        <RunButton
          action={runPeerResearch.bind(null, profileId)}
          label={items.length ? "Search again" : "Find peer posts"}
          pendingLabel="Searching..."
          hint="Searching X and LinkedIn. 30 to 90 seconds."
          size="sm"
        />
      </div>

      <button type="button" onClick={() => setOpen((v) => !v)} className="mt-3 text-xs font-semibold text-coral-dark hover:underline">
        {open ? "Hide peer accounts" : "Add specific peer accounts"}
      </button>
      {open && <PeerAccountsForm profileId={profileId} />}

      <ItemList items={items} emptyText="No peer posts yet. Search above once you have a few topics saved." />
    </div>
  );
}

function PeerAccountsForm({ profileId }: { profileId: string }) {
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          await updatePeerAccounts(profileId, fd);
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        })
      }
      className="mt-3 space-y-2 rounded-lg bg-cream-soft p-3"
    >
      <input
        name="peerXHandles"
        placeholder="X handles, comma separated (e.g. dhh, levelsio)"
        className="w-full rounded-lg border border-sand bg-white px-2.5 py-1.5 text-xs text-ink placeholder:text-ink-soft focus:border-coral focus:outline-none"
      />
      <input
        name="peerLinkedinUrls"
        placeholder="LinkedIn profile URLs, comma separated"
        className="w-full rounded-lg border border-sand bg-white px-2.5 py-1.5 text-xs text-ink placeholder:text-ink-soft focus:border-coral focus:outline-none"
      />
      <input
        name="researchKeywords"
        placeholder="News keywords, comma separated (defaults to your topics)"
        className="w-full rounded-lg border border-sand bg-white px-2.5 py-1.5 text-xs text-ink placeholder:text-ink-soft focus:border-coral focus:outline-none"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-coral px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-coral-dark disabled:opacity-60"
      >
        {pending ? "Saving..." : saved ? "Saved" : "Save"}
      </button>
    </form>
  );
}

function NewsPanel({ profileId, items }: { profileId: string; items: ResearchItem[] }) {
  return (
    <div className="rounded-xl border border-sand bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-soft">Searches Google for recent articles and blog posts on your topics.</p>
        <RunButton
          action={runNewsResearch.bind(null, profileId)}
          label={items.length ? "Search again" : "Find news"}
          pendingLabel="Searching..."
          hint="Searching the web. 20 to 60 seconds."
          size="sm"
        />
      </div>
      <ItemList items={items} emptyText="No articles yet. Search above once you have a few topics saved." />
    </div>
  );
}

function ItemList({ items, emptyText }: { items: ResearchItem[]; emptyText: string }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  if (items.length === 0) return <p className="mt-4 text-sm text-ink-soft">{emptyText}</p>;

  return (
    <ul className="mt-4 space-y-2.5">
      {items.slice(0, 20).map((item) => {
        const isOpen = expanded.has(item.id);
        const long = item.text.length > 220;
        return (
          <li key={item.id} className="rounded-lg border border-sand bg-cream-soft p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                  <span className="rounded-full bg-white px-2 py-0.5 font-semibold text-ink">{item.platform === "web" ? "web" : item.platform}</span>
                  {item.author && <span className="font-medium text-ink">{item.author}</span>}
                  {(item.likes > 0 || item.comments > 0) && (
                    <span>
                      {item.likes} likes · {item.comments} comments
                    </span>
                  )}
                </div>
                {item.title && <p className="mt-1 text-sm font-semibold text-ink">{item.title}</p>}
                <p className={`mt-1 text-sm text-ink ${isOpen || !long ? "" : "line-clamp-3"}`}>{item.text}</p>
                {long && (
                  <button
                    type="button"
                    onClick={() =>
                      setExpanded((prev) => {
                        const next = new Set(prev);
                        if (next.has(item.id)) next.delete(item.id);
                        else next.add(item.id);
                        return next;
                      })
                    }
                    className="mt-1 text-xs font-semibold text-coral-dark hover:underline"
                  >
                    {isOpen ? "Less" : "More"}
                  </button>
                )}
                <a href={item.url} target="_blank" rel="noreferrer" className="mt-1 block text-xs text-coral-dark hover:underline">
                  Open original →
                </a>
              </div>
              <StatusButtons itemId={item.id} status={item.status} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function StatusButtons({ itemId, status }: { itemId: string; status: string }) {
  const [pending, startTransition] = useTransition();
  const [local, setLocal] = useState(status);

  function set(next: "kept" | "dismissed") {
    setLocal(next);
    startTransition(async () => {
      await setResearchStatus(itemId, next);
    });
  }

  if (local === "kept") {
    return <span className="shrink-0 rounded-full bg-sage px-2.5 py-1 text-xs font-semibold text-sage-text">Kept ✓</span>;
  }
  return (
    <div className="flex shrink-0 gap-1">
      <button
        type="button"
        onClick={() => set("kept")}
        disabled={pending}
        className="rounded-lg border border-sand bg-white px-2 py-1 text-xs font-semibold text-ink-soft transition hover:border-coral hover:text-coral-dark disabled:opacity-50"
        title="Keep for the strategist"
      >
        Keep
      </button>
      <button
        type="button"
        onClick={() => set("dismissed")}
        disabled={pending}
        className="rounded-lg border border-sand bg-white px-2 py-1 text-xs font-semibold text-ink-soft transition hover:border-rose hover:text-rose disabled:opacity-50"
        title="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
