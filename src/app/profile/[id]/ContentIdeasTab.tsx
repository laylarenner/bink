"use client";

import { useState, useTransition } from "react";
import type { ContentIdea } from "@prisma/client";
import { deleteIdea, markIdeaUsed, reviseIdeaAction, runGenerateIdeas, setIdeaStatus } from "@/app/actions";
import { RunButton } from "@/components/run-button";

const SOURCE_LABEL: Record<string, string> = { own: "From your work", news: "From the news", peer: "From a peer" };
const SOURCE_TONE: Record<string, string> = { own: "bg-peach text-coral-dark", news: "bg-sky text-sky-text", peer: "bg-sage text-sage-text" };
const PLATFORM_LABEL: Record<string, string> = { linkedin: "LinkedIn", x: "X", both: "LinkedIn + X" };

type Filter = "all" | "own" | "news" | "peer";

export default function ContentIdeasTab({ profileId, ideas }: { profileId: string; ideas: ContentIdea[] }) {
  const [filter, setFilter] = useState<Filter>("all");

  const fresh = ideas.filter((i) => i.status === "new");
  const kept = ideas.filter((i) => i.status === "kept");
  const visible = (filter === "all" ? fresh : fresh.filter((i) => i.source === filter)).sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );

  const counts: Record<Filter, number> = { all: fresh.length, own: 0, news: 0, peer: 0 };
  for (const i of fresh) counts[i.source as Filter] = (counts[i.source as Filter] ?? 0) + 1;

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h2 className="text-lg font-bold text-ink">Content ideas</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Pulled from your own work, the news in your niche, and what&apos;s working for peers. Use the ones worth
          writing, edit any that need a different angle, delete the rest.
        </p>
      </div>

      <div className="rounded-lg border border-dashed border-coral/50 bg-cream-soft p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-ink">{ideas.length === 0 ? "Ready for ideas?" : "Want more?"}</p>
            <p className="mt-0.5 text-xs text-ink-soft">
              {ideas.length === 0
                ? "Reads your strategy, plus any news and peer posts you've fetched, and proposes specific angles."
                : "Generates more without repeating what you already have."}
            </p>
          </div>
          <RunButton
            action={runGenerateIdeas.bind(null, profileId)}
            label={ideas.length === 0 ? "Generate ideas" : "Generate more"}
            pendingLabel="Thinking..."
            hint="Reading your strategy, news and peer posts. 20 to 60 seconds."
            variant="primary"
          />
        </div>
      </div>

      {fresh.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <FilterButton active={filter === "all"} onClick={() => setFilter("all")} label={`All (${counts.all})`} />
          {counts.own > 0 && <FilterButton active={filter === "own"} onClick={() => setFilter("own")} label={`Your work (${counts.own})`} />}
          {counts.news > 0 && <FilterButton active={filter === "news"} onClick={() => setFilter("news")} label={`News (${counts.news})`} />}
          {counts.peer > 0 && <FilterButton active={filter === "peer"} onClick={() => setFilter("peer")} label={`Peers (${counts.peer})`} />}
        </div>
      )}

      {ideas.length === 0 ? (
        <p className="rounded-xl border border-dashed border-sand bg-cream-soft px-4 py-6 text-sm text-ink-soft">
          No ideas yet. Generate some above.
        </p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-ink-soft">
          {fresh.length === 0 ? "You've gone through all of them. Generate more above." : "Nothing in this filter."}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {visible.map((idea) => (
            <IdeaCard key={idea.id} profileId={profileId} idea={idea} />
          ))}
        </div>
      )}

      {kept.length > 0 && (
        <details>
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-wide text-ink-soft">
            Kept ({kept.length})
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {kept
              .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
              .map((idea) => (
                <IdeaCard key={idea.id} profileId={profileId} idea={idea} kept />
              ))}
          </div>
        </details>
      )}
    </div>
  );
}

function FilterButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
        active ? "bg-coral text-white" : "border border-sand bg-white text-ink-soft hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}

function IdeaCard({ profileId, idea, kept }: { profileId: string; idea: ContentIdea; kept?: boolean }) {
  const [pending, startTransition] = useTransition();
  const [useResult, setUseResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [using, startUsing] = useTransition();
  const [localStatus, setLocalStatus] = useState(idea.status);
  const [deleted, setDeleted] = useState(false);
  const [editing, setEditing] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [display, setDisplay] = useState({ title: idea.title, angle: idea.angle, platform: idea.platform, pillar: idea.pillar });
  const [revising, startRevising] = useTransition();
  const [reviseError, setReviseError] = useState<string | null>(null);

  function set(status: "kept" | "dismissed" | "new") {
    setLocalStatus(status);
    startTransition(async () => {
      await setIdeaStatus(idea.id, status);
    });
  }

  function use() {
    setLocalStatus("kept");
    setUseResult(null);
    startUsing(async () => {
      const result = await markIdeaUsed(profileId, idea.id);
      setUseResult(result);
    });
  }

  function remove() {
    setDeleted(true);
    startTransition(async () => {
      await deleteIdea(idea.id);
    });
  }

  function rewrite() {
    if (!instruction.trim()) return;
    setReviseError(null);
    const fd = new FormData();
    fd.set("instruction", instruction);
    startRevising(async () => {
      const result = await reviseIdeaAction(idea.id, fd);
      if (result.ok && result.idea) {
        setDisplay(result.idea);
        setInstruction("");
        setEditing(false);
      } else {
        setReviseError(result.message);
      }
    });
  }

  if (localStatus === "dismissed" || deleted) return null;

  return (
    <div className={`flex flex-col rounded-xl border border-sand bg-white p-4 shadow-sm ${pending || revising ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${SOURCE_TONE[idea.source] ?? "bg-cream-soft text-ink-soft"}`}>
          {SOURCE_LABEL[idea.source] ?? idea.source}
        </span>
        <span className="rounded-full border border-sand px-2 py-0.5 text-[10px] font-semibold text-ink-soft">
          {PLATFORM_LABEL[display.platform] ?? display.platform}
        </span>
        {display.pillar && <span className="rounded-full border border-sand px-2 py-0.5 text-[10px] text-ink-soft">{display.pillar}</span>}
      </div>

      <p className="mt-2 text-sm font-semibold text-ink">{display.title}</p>
      <p className="mt-1 flex-1 text-sm text-ink">{display.angle}</p>

      <p className="mt-2 text-xs text-ink-soft">
        {idea.sourceTitle ? `${idea.sourceTitle} — ${idea.evidence}` : idea.evidence}
        {idea.sourceUrl && (
          <>
            {" · "}
            <a href={idea.sourceUrl} target="_blank" rel="noreferrer" className="text-coral-dark hover:underline">
              source
            </a>
          </>
        )}
      </p>

      {editing && (
        <div className="mt-3 rounded-lg bg-cream-soft p-3">
          <label className="mb-1 block text-xs font-semibold text-ink">What should change?</label>
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            rows={2}
            placeholder="e.g. make this more about the specific tool I used, or add that I did this for free at first"
            className="w-full rounded-lg border border-sand bg-white px-2.5 py-1.5 text-xs text-ink placeholder:text-ink-soft focus:border-coral focus:outline-none"
          />
          {reviseError && <p className="mt-1.5 text-xs text-rose">{reviseError}</p>}
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={rewrite}
              disabled={revising || !instruction.trim()}
              className="rounded-lg bg-coral px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-coral-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              {revising ? "Rewriting..." : "Rewrite"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setReviseError(null);
              }}
              disabled={revising}
              className="rounded-lg border border-sand px-3 py-1.5 text-xs font-semibold text-ink-soft transition hover:text-ink disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {kept || localStatus === "kept" ? (
          <button
            type="button"
            onClick={() => set("new")}
            disabled={pending}
            className="rounded-lg border border-sand px-3 py-1.5 text-xs font-semibold text-ink-soft transition hover:border-coral hover:text-coral-dark disabled:opacity-50"
          >
            Move back to new
          </button>
        ) : (
          <button
            type="button"
            onClick={use}
            disabled={using}
            className="rounded-lg bg-coral px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-coral-dark disabled:cursor-wait disabled:opacity-70"
          >
            {using ? "Writing draft..." : "Use"}
          </button>
        )}
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            disabled={pending}
            className="rounded-lg border border-sand px-3 py-1.5 text-xs font-semibold text-ink-soft transition hover:border-coral hover:text-coral-dark disabled:opacity-50"
          >
            Edit
          </button>
        )}
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          className="rounded-lg border border-sand px-3 py-1.5 text-xs font-semibold text-ink-soft transition hover:border-rose hover:text-rose disabled:opacity-50"
        >
          Delete
        </button>
      </div>

      {useResult && (
        <p className={`mt-2 text-xs ${useResult.ok ? "text-sage-text" : "text-rose"}`}>{useResult.message}</p>
      )}
    </div>
  );
}
