"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import type { Profile, ResearchItem } from "@prisma/client";
import { updateStrategyFields } from "@/app/actions";
import { PillarsEditor, TopicsEditor, type Pillar } from "./PillarsEditor";
import ResearchSection from "./ResearchSection";
import StrategyChatPanel from "./StrategyChatPanel";

function safeArray<T>(json: string | null | undefined): T[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function SaveButton({ justSaved }: { justSaved: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition disabled:cursor-not-allowed ${
        justSaved && !pending ? "bg-sage-text" : "bg-coral hover:bg-coral-dark"
      }`}
    >
      {pending ? "Saving..." : justSaved ? "Saved ✓" : "Save changes"}
    </button>
  );
}

export default function StrategyTab({
  profile,
  messages,
  research,
}: {
  profile: Profile;
  messages: { role: "user" | "assistant"; content: string }[];
  research: ResearchItem[];
}) {
  // Keyed by strategyUpdatedAt from the parent, so a fresh save from the chat
  // (router.refresh()) remounts this with new initial values instead of needing
  // an effect to resync local state.
  const [pillars, setPillars] = useState<Pillar[]>(safeArray(profile.pillars));
  const [topics, setTopics] = useState<string[]>(safeArray(profile.topics));
  const [positioning, setPositioning] = useState(profile.positioning ?? "");
  const [audience, setAudience] = useState(profile.audience ?? "");
  const hasStrategy = pillars.length > 0;
  // Once a strategy exists, show it as a compact summary by default — the full
  // editable form (4 labeled fields, every pillar and topic spelled out) is a
  // lot to read at a glance. "Edit" reveals the same form, nothing removed.
  const [editing, setEditing] = useState(!hasStrategy);

  const [state, formAction] = useActionState(
    async (_prev: { savedAt: number } | null, formData: FormData) => {
      await updateStrategyFields(profile.id, formData);
      return { savedAt: Date.now() };
    },
    null,
  );
  const [justSaved, setJustSaved] = useState(false);
  useEffect(() => {
    if (!state) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- auto-dismissing "Saved" confirmation, not derived render state
    setJustSaved(true);
    const timeout = setTimeout(() => setJustSaved(false), 2500);
    return () => clearTimeout(timeout);
  }, [state]);

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h2 className="text-lg font-bold text-ink">Strategy</h2>
        <p className="mt-1 text-sm text-ink-soft">Talk it through with Bink. It opens with what it learned about you.</p>
      </div>

      <StrategyChatPanel profileId={profile.id} initialMessages={messages} />

      <ResearchSection profileId={profile.id} items={research} peerSearchQuery={profile.peerSearchQuery ?? ""} />

      {hasStrategy && !editing && (
        <div className="rounded-xl border border-sand bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">Your strategy</p>
            <button type="button" onClick={() => setEditing(true)} className="shrink-0 text-xs font-semibold text-coral-dark hover:underline">
              Edit
            </button>
          </div>
          {positioning && <p className="mt-2 text-sm text-ink">{positioning}</p>}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {pillars.map((p) => (
              <span key={p.name} title={p.description} className="rounded-full bg-peach px-2.5 py-1 text-xs font-semibold text-coral-dark">
                {p.name}
              </span>
            ))}
          </div>
          {topics.length > 0 && (
            <p className="mt-3 text-xs text-ink-soft">
              Topics: {topics.slice(0, 4).join(" · ")}
              {topics.length > 4 ? ` +${topics.length - 4} more` : ""}
            </p>
          )}
        </div>
      )}

      {hasStrategy && editing && (
        <form action={formAction} className="space-y-5 rounded-xl border border-sand bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">Edit your strategy</p>
            <button type="button" onClick={() => setEditing(false)} className="text-xs font-semibold text-ink-soft hover:text-ink">
              Done editing
            </button>
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-ink">Positioning</label>
            <textarea
              name="positioning"
              value={positioning}
              onChange={(e) => setPositioning(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-sand bg-cream-soft px-3 py-2 text-sm text-ink focus:border-coral focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-ink">Who this is for</label>
            <input
              name="audience"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              className="w-full rounded-lg border border-sand bg-cream-soft px-3 py-2 text-sm text-ink focus:border-coral focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-ink">What you&apos;re known for</label>
            <PillarsEditor name="pillars" items={pillars} onChange={setPillars} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-ink">Topics to post about</label>
            <TopicsEditor name="topics" items={topics} onChange={setTopics} />
          </div>
          <SaveButton justSaved={justSaved} />
        </form>
      )}
    </div>
  );
}
