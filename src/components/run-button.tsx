"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "@/app/actions";

type Props = {
  /** A server action already bound to its arguments, e.g. `runGithubScrape.bind(null, id)`. */
  action: () => Promise<ActionResult>;
  label: string;
  pendingLabel: string;
  hint?: string;
  variant?: "primary" | "secondary";
  size?: "sm" | "md" | "lg";
  className?: string;
  onDone?: (result: ActionResult) => void;
};

export function RunButton({
  action,
  label,
  pendingLabel,
  hint,
  variant = "secondary",
  size = "md",
  className = "",
  onDone,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  const sizing =
    size === "lg" ? "px-6 py-3 text-sm" : size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2.5 text-sm";
  const colors =
    variant === "primary"
      ? "bg-coral text-white shadow-sm hover:bg-coral-dark"
      : "border border-sand bg-white text-ink shadow-sm hover:border-coral hover:text-coral-dark";

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setResult(null);
          startTransition(async () => {
            let r: ActionResult;
            try {
              r = await action();
            } catch (err) {
              r = { ok: false, message: err instanceof Error ? err.message : "Something went wrong." };
            }
            setResult(r);
            onDone?.(r);
          });
        }}
        className={`inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition disabled:cursor-wait disabled:opacity-60 ${sizing} ${colors}`}
      >
        {pending && <Spinner />}
        {pending ? pendingLabel : label}
      </button>

      {pending && (
        <p className="text-xs text-ink-soft">{hint ?? "This usually takes 30 to 90 seconds. Keep this tab open."}</p>
      )}

      {result && !pending && (
        <div
          className={`min-w-0 break-words rounded-lg px-3 py-2 text-xs ${
            result.ok ? "bg-sage/50 font-semibold text-sage-text" : "bg-rose/10 text-rose"
          }`}
        >
          <p>{result.message}</p>
          {result.steps && result.steps.length > 0 && (
            <ul className="mt-1.5 space-y-1 font-normal">
              {result.steps.map((s) => (
                <li key={s.label} className={`flex gap-2 ${s.ok ? "text-sage-text" : "text-rose"}`}>
                  <span aria-hidden>{s.ok ? "✓" : "✗"}</span>
                  <span>
                    <span className="font-semibold">{s.label}:</span> {s.message}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}
