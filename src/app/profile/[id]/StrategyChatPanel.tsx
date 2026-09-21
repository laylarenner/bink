"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { continueStrategyChat, sendStrategyMessage, startStrategyChat } from "@/app/actions";

type ChatMessage = { role: "user" | "assistant"; content: string; pending?: boolean };

export default function StrategyChatPanel({
  profileId,
  initialMessages,
}: {
  profileId: string;
  initialMessages: { role: "user" | "assistant"; content: string }[];
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [text, setText] = useState("");
  const [attachOpen, setAttachOpen] = useState(false);
  const [isSending, startSending] = useTransition();
  const [isOpening, startOpening] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  // A brand new profile has no chat history yet: let the strategist open on its own.
  // If the last saved message is from the user with no reply (a dropped connection,
  // a server restart mid-turn), pick that turn back up instead of leaving it stuck.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    if (initialMessages.length === 0) {
      startOpening(async () => {
        setMessages([{ role: "assistant", content: "...", pending: true }]);
        try {
          const result = await startStrategyChat(profileId);
          setMessages([{ role: "assistant", content: result.reply }]);
        } catch (err) {
          setMessages([]);
          setError(err instanceof Error ? err.message : "Could not start the chat.");
        }
      });
      return;
    }

    if (initialMessages[initialMessages.length - 1]?.role === "user") {
      startOpening(async () => {
        setMessages([...initialMessages, { role: "assistant", content: "...", pending: true }]);
        try {
          const result = await continueStrategyChat(profileId);
          setMessages([...initialMessages, { role: "assistant", content: result.reply }]);
        } catch (err) {
          setMessages(initialMessages);
          setError(err instanceof Error ? err.message : "Could not get a reply. Try sending your question again.");
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  function handleSend() {
    const trimmed = text.trim();
    const files = fileInputRef.current?.files;
    const hasFiles = !!files && files.length > 0;
    if (!trimmed && !hasFiles) return;

    setError(null);
    const fileNames = files ? Array.from(files).map((f) => f.name) : [];
    const outgoing = [trimmed, fileNames.length ? `📎 ${fileNames.join(", ")}` : ""].filter(Boolean).join("\n");
    setMessages((prev) => [...prev, { role: "user", content: outgoing }, { role: "assistant", content: "...", pending: true }]);

    const fd = new FormData();
    fd.set("message", text);
    if (files) for (const file of Array.from(files)) fd.append("attachments", file);

    setText("");
    setAttachOpen(false);
    if (fileInputRef.current) fileInputRef.current.value = "";

    startSending(async () => {
      try {
        const result = await sendStrategyMessage(profileId, fd);
        setMessages((prev) => [...prev.slice(0, -1), { role: "assistant", content: result.reply }]);
        if (result.saved) router.refresh();
      } catch (err) {
        setMessages((prev) => prev.slice(0, -1));
        setError(err instanceof Error ? err.message : "Could not send that.");
      }
    });
  }

  const busy = isSending || isOpening;

  return (
    <div className="rounded-xl border border-sand bg-white shadow-sm">
      <div ref={scrollRef} className="max-h-[32rem] min-h-[16rem] space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && !isOpening && (
          <p className="text-sm text-ink-soft">Say hello to start, or reload the page to have your strategist open.</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-3.5 py-2 text-sm ${
                m.role === "user" ? "bg-coral text-white" : `bg-cream-soft text-ink ${m.pending ? "text-ink-soft" : ""}`
              }`}
            >
              {m.pending ? <Dots /> : m.content}
            </div>
          </div>
        ))}
      </div>

      {error && <p className="border-t border-sand bg-rose/10 px-4 py-2 text-xs text-rose">{error}</p>}

      {attachOpen && (
        <div className="border-t border-sand bg-cream-soft p-3">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.txt,.md,.csv,.json,.png,.jpg,.jpeg,.gif,.webp"
            className="min-w-0 flex-1 rounded-lg border border-sand bg-white px-2.5 py-1.5 text-xs text-ink file:mr-2 file:rounded-md file:border-0 file:bg-coral file:px-2.5 file:py-1 file:text-xs file:font-semibold file:text-white"
          />
          <p className="mt-1.5 text-xs text-ink-soft">PDFs, Word docs, text files, or images (we read the text and describe what&apos;s shown).</p>
        </div>
      )}

      <div className="flex items-end gap-2 border-t border-sand p-3">
        <button
          type="button"
          onClick={() => setAttachOpen((o) => !o)}
          title="Attach a file"
          disabled={busy}
          className={`shrink-0 rounded-lg border px-2.5 py-2 text-sm transition disabled:opacity-50 ${
            attachOpen ? "border-coral bg-peach text-coral-dark" : "border-sand text-ink-soft hover:text-ink"
          }`}
        >
          📎
        </button>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          rows={2}
          disabled={busy}
          placeholder={isOpening ? "Your strategist is thinking..." : "What do you want to share about?"}
          className="min-w-0 flex-1 resize-none rounded-lg border border-sand bg-cream-soft px-3 py-2 text-sm text-ink placeholder:text-ink-soft focus:border-coral focus:outline-none disabled:opacity-60"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={busy}
          className="shrink-0 rounded-lg bg-coral px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-coral-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSending ? "..." : "Send"}
        </button>
      </div>
    </div>
  );
}

function Dots() {
  return (
    <span className="inline-flex gap-1">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-soft [animation-delay:-0.2s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-soft [animation-delay:-0.1s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-soft" />
    </span>
  );
}
