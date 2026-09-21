"use client";

import { useEffect, useState, useTransition } from "react";
import QRCode from "qrcode";
import type { ContentIdea, Draft } from "@prisma/client";
import { deleteDraft, publishDraft, regenerateDraft, updateDraftText, writeDraftForIdea } from "@/app/actions";
import { DEMO_MODE } from "@/lib/demoModeShared";
import { RunButton } from "@/components/run-button";
import ConnectAccounts from "./ConnectAccounts";

const PLATFORM_LABEL: Record<string, string> = { linkedin: "LinkedIn", x: "X" };
const CHAR_LIMIT: Record<string, number> = { x: 280 };

type IdeaWithDrafts = ContentIdea & { drafts: Draft[] };

export default function PostsTab({ profileId, ideas }: { profileId: string; ideas: IdeaWithDrafts[] }) {
  if (ideas.length === 0) {
    return (
      <div className="max-w-3xl space-y-8">
        <div>
          <h2 className="text-lg font-bold text-ink">Posts</h2>
          <p className="mt-1 text-sm text-ink-soft">Drafts written from the ideas you use, in your voice.</p>
        </div>
        <ConnectAccounts profileId={profileId} />
        <p className="rounded-xl border border-dashed border-sand bg-cream-soft px-4 py-6 text-sm text-ink-soft">
          Nothing here yet. Go to Content Ideas and click Use on the ones worth writing.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h2 className="text-lg font-bold text-ink">Posts</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Every draft is grounded in the idea it came from, checked against what you have already posted, and
          written in your voice, not copied from anyone.
        </p>
      </div>

      <ConnectAccounts profileId={profileId} />

      <div className="space-y-6">
        {ideas.map((idea) => (
          <IdeaGroup key={idea.id} profileId={profileId} idea={idea} />
        ))}
      </div>
    </div>
  );
}

function IdeaGroup({ profileId, idea }: { profileId: string; idea: IdeaWithDrafts }) {
  const platforms = idea.platform === "both" ? (["linkedin", "x"] as const) : ([idea.platform as "linkedin" | "x"] as const);
  const missing = platforms.filter((p) => !idea.drafts.some((d) => d.platform === p));

  return (
    <div className="rounded-xl border border-sand bg-white p-4 shadow-sm">
      <p className="text-sm font-semibold text-ink">{idea.title}</p>
      <p className="mt-1 text-xs text-ink-soft">{idea.angle}</p>

      <div className="mt-4 space-y-4">
        {idea.drafts.map((draft) => (
          <DraftCard key={draft.id} draft={draft} />
        ))}
      </div>

      {missing.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {missing.map((platform) => (
            <RunButton
              key={platform}
              action={writeDraftForIdea.bind(null, profileId, idea.id, platform)}
              label={`Write ${PLATFORM_LABEL[platform]} draft`}
              pendingLabel="Writing..."
              hint="20 to 40 seconds."
              size="sm"
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DraftCard({ draft }: { draft: Draft }) {
  const [text, setText] = useState(draft.text);
  const [savedText, setSavedText] = useState(draft.text);
  const [editingText, setEditingText] = useState(false);
  const [saving, startSaving] = useTransition();
  const [copied, setCopied] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [deleting, startDeleting] = useTransition();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [status, setStatus] = useState(draft.status);
  const [scheduledFor, setScheduledFor] = useState(draft.scheduledFor);
  const [postError, setPostError] = useState(draft.postError);
  const [postUrl, setPostUrl] = useState(draft.postUrl);
  const [publishing, startPublishing] = useTransition();

  function publish(when: "now" | "best") {
    setPostError(null);
    startPublishing(async () => {
      const result = await publishDraft(draft.id, when);
      if (result.ok) {
        setStatus(when === "best" ? "scheduled" : "posted");
        setScheduledFor(result.scheduledFor ? new Date(result.scheduledFor) : null);
        setPostUrl(result.postUrl ?? null);
      } else {
        setStatus("failed");
        setPostError(result.message);
      }
    });
  }

  const limit = CHAR_LIMIT[draft.platform];
  const overLimit = limit ? text.length > limit : false;

  function save() {
    startSaving(async () => {
      await updateDraftText(draft.id, text);
      setSavedText(text);
      setEditingText(false);
    });
  }

  function copy() {
    navigator.clipboard?.writeText(savedText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  function remove() {
    setDeleted(true);
    startDeleting(async () => {
      await deleteDraft(draft.id);
    });
  }

  if (deleted) return null;

  return (
    <div className="rounded-lg border border-sand bg-cream-soft p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-ink">{PLATFORM_LABEL[draft.platform] ?? draft.platform}</span>
        {limit && (
          <span className={`text-xs ${overLimit ? "font-semibold text-rose" : "text-ink-soft"}`}>
            {text.length}/{limit}
          </span>
        )}
      </div>

      {editingText ? (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          className="w-full rounded-lg border border-sand bg-white px-3 py-2 text-sm text-ink focus:border-coral focus:outline-none"
        />
      ) : (
        <p className="whitespace-pre-wrap text-sm text-ink">{savedText}</p>
      )}

      {feedbackOpen && !editingText && (
        <EditFeedback
          draftId={draft.id}
          onUpdate={(newText) => {
            setText(newText);
            setSavedText(newText);
          }}
          onDone={() => setFeedbackOpen(false)}
        />
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {editingText ? (
          <>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-coral px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-coral-dark disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={() => {
                setText(savedText);
                setEditingText(false);
              }}
              disabled={saving}
              className="rounded-lg border border-sand px-3 py-1.5 text-xs font-semibold text-ink-soft transition hover:text-ink disabled:opacity-60"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={copy}
              className="rounded-lg border border-sand bg-white px-3 py-1.5 text-xs font-semibold text-ink-soft transition hover:border-coral hover:text-coral-dark"
            >
              {copied ? "Copied ✓" : "Copy"}
            </button>
            <button
              type="button"
              onClick={() => setFeedbackOpen((v) => !v)}
              className="rounded-lg border border-sand bg-white px-3 py-1.5 text-xs font-semibold text-ink-soft transition hover:border-coral hover:text-coral-dark"
            >
              {feedbackOpen ? "Close" : "Edit"}
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={deleting}
              className="rounded-lg border border-sand bg-white px-3 py-1.5 text-xs font-semibold text-ink-soft transition hover:border-rose hover:text-rose disabled:opacity-60"
            >
              Delete
            </button>
          </>
        )}
      </div>

      <div className="mt-3 border-t border-sand pt-3">
        {status === "posted" ? (
          <div>
            <p className="text-xs font-semibold text-sage-text">✓ Posted{draft.postedAt ? ` ${new Date(draft.postedAt).toLocaleString()}` : ""}.</p>
            {postUrl && <PostQrCode url={postUrl} />}
          </div>
        ) : status === "scheduled" ? (
          <p className="text-xs font-semibold text-sage-text">✓ Scheduled for {scheduledFor ? new Date(scheduledFor).toLocaleString() : "soon"}.</p>
        ) : draft.platform !== "linkedin" ? (
          <p className="text-xs text-ink-soft">Auto-posting is only set up for LinkedIn right now. Copy this one and paste it into X yourself.</p>
        ) : DEMO_MODE ? (
          <p className="text-xs text-ink-soft">Real posting is turned off in this public demo. Copy this draft to use it yourself.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => publish("now")}
              disabled={publishing}
              className="rounded-lg bg-coral px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-coral-dark disabled:cursor-wait disabled:opacity-60"
            >
              {publishing ? "Posting..." : "Post now"}
            </button>
            <button
              type="button"
              onClick={() => publish("best")}
              disabled={publishing}
              className="rounded-lg border border-sand bg-white px-3 py-1.5 text-xs font-semibold text-ink-soft transition hover:border-coral hover:text-coral-dark disabled:cursor-wait disabled:opacity-60"
            >
              Schedule for the best time
            </button>
          </div>
        )}
        {postError && <p className="mt-1.5 text-xs text-rose">{postError}</p>}
      </div>
    </div>
  );
}

/** Scans straight to the live post, generated locally — nothing sent anywhere. */
function PostQrCode({ url }: { url: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(url, { width: 120, margin: 1 }).then((result) => {
      if (!cancelled) setDataUrl(result);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (dismissed) return null;

  return (
    <div className="relative mt-2 flex items-center gap-3 rounded-lg border border-sand bg-white p-3">
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Close"
        className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full text-ink-soft transition hover:bg-cream-soft hover:text-ink"
      >
        ✕
      </button>
      {dataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- a locally-generated data URI, not a remote image
        <img src={dataUrl} alt="QR code to the live post" width={80} height={80} className="rounded" />
      ) : (
        <div className="h-20 w-20 shrink-0 rounded bg-cream-soft" />
      )}
      <div className="min-w-0 pr-4">
        <p className="text-xs font-semibold text-ink">Scan to see it live</p>
        <a href={url} target="_blank" rel="noreferrer" className="mt-0.5 block truncate text-xs text-coral-dark hover:underline">
          {url}
        </a>
      </div>
    </div>
  );
}

type FeedbackTurn = { instruction: string };

/**
 * A persistent feedback loop, not a one-shot box: each instruction rewrites
 * the draft and stays open so the next round of feedback can build on it.
 * Only "Done" closes it.
 */
function EditFeedback({
  draftId,
  onUpdate,
  onDone,
}: {
  draftId: string;
  onUpdate: (text: string) => void;
  onDone: () => void;
}) {
  const [instruction, setInstruction] = useState("");
  const [history, setHistory] = useState<FeedbackTurn[]>([]);
  const [pending, startPending] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function send() {
    const trimmed = instruction.trim();
    if (!trimmed) return;
    setError(null);
    const fd = new FormData();
    fd.set("instruction", trimmed);
    startPending(async () => {
      const result = await regenerateDraft(draftId, fd);
      if (result.ok && result.text) {
        onUpdate(result.text);
        setHistory((prev) => [...prev, { instruction: trimmed }]);
        setInstruction("");
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <div className="mt-3 rounded-lg bg-white p-3">
      {history.length > 0 && (
        <ul className="mb-3 space-y-1.5">
          {history.map((turn, i) => (
            <li key={i} className="rounded-lg bg-cream-soft px-2.5 py-1.5 text-xs text-ink-soft">
              <span className="font-semibold text-ink">You: </span>
              {turn.instruction}
            </li>
          ))}
        </ul>
      )}
      <label className="mb-1 block text-xs font-semibold text-ink">
        {history.length === 0 ? "What should change?" : "Anything else?"}
      </label>
      <textarea
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
        rows={2}
        placeholder="e.g. shorter, more direct opening line, add the specific number"
        className="w-full rounded-lg border border-sand bg-cream-soft px-2.5 py-1.5 text-xs text-ink placeholder:text-ink-soft focus:border-coral focus:outline-none"
      />
      {error && <p className="mt-1.5 text-xs text-rose">{error}</p>}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={send}
          disabled={pending || !instruction.trim()}
          className="rounded-lg bg-coral px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-coral-dark disabled:opacity-60"
        >
          {pending ? "Rewriting..." : "Send"}
        </button>
        <button
          type="button"
          onClick={onDone}
          disabled={pending}
          className="rounded-lg border border-sand px-3 py-1.5 text-xs font-semibold text-ink-soft transition hover:text-ink disabled:opacity-60"
        >
          Done
        </button>
      </div>
    </div>
  );
}
