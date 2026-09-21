"use client";

import { useState } from "react";

export type Pillar = { name: string; description: string };

/** Add/remove pillars, backed by a hidden JSON input so it posts with the form. */
export function PillarsEditor({ name, items, onChange }: { name: string; items: Pillar[]; onChange: (next: Pillar[]) => void }) {
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");

  function add() {
    if (!draftName.trim()) return;
    onChange([...items, { name: draftName.trim(), description: draftDescription.trim() }]);
    setDraftName("");
    setDraftDescription("");
  }

  return (
    <div>
      <input type="hidden" name={name} value={JSON.stringify(items)} readOnly />
      {items.length > 0 && (
        <div className="mb-2.5 space-y-1.5">
          {items.map((item, i) => (
            <div key={`${item.name}-${i}`} className="flex items-start justify-between gap-2 rounded-lg border border-sand bg-white px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">{item.name}</p>
                {item.description && <p className="mt-0.5 text-xs text-ink-soft">{item.description}</p>}
              </div>
              <button
                type="button"
                onClick={() => onChange(items.filter((_, idx) => idx !== i))}
                className="shrink-0 text-ink-soft hover:text-rose"
                title="Remove"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          placeholder="Pillar name"
          className="min-w-0 flex-1 rounded-lg border border-sand bg-cream-soft px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-soft focus:border-coral focus:outline-none"
        />
        <input
          value={draftDescription}
          onChange={(e) => setDraftDescription(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          placeholder="What it covers..."
          className="min-w-0 flex-[2] rounded-lg border border-sand bg-cream-soft px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-soft focus:border-coral focus:outline-none"
        />
        <button
          type="button"
          onClick={add}
          disabled={!draftName.trim()}
          className="shrink-0 rounded-lg bg-coral px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-coral-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          Add
        </button>
      </div>
    </div>
  );
}

export function TopicsEditor({ name, items, onChange }: { name: string; items: string[]; onChange: (next: string[]) => void }) {
  const [draft, setDraft] = useState("");

  function add() {
    const trimmed = draft.trim();
    if (!trimmed || items.some((t) => t.toLowerCase() === trimmed.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...items, trimmed]);
    setDraft("");
  }

  return (
    <div>
      <input type="hidden" name={name} value={JSON.stringify(items)} readOnly />
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          placeholder="Add a topic and press Enter..."
          className="min-w-[220px] flex-1 rounded-lg border border-sand bg-cream-soft px-3 py-2 text-sm text-ink placeholder:text-ink-soft focus:border-coral focus:outline-none"
        />
        <button
          type="button"
          onClick={add}
          disabled={!draft.trim()}
          className="rounded-lg bg-coral px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-coral-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          Add
        </button>
      </div>
      {items.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {items.map((t) => (
            <span key={t} className="flex items-center gap-1.5 rounded-full border border-sand bg-cream-soft py-1 pl-3 pr-2 text-xs font-medium text-ink">
              {t}
              <button type="button" onClick={() => onChange(items.filter((x) => x !== t))} className="text-ink-soft hover:text-rose" title="Remove">
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
