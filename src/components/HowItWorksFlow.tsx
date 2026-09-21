"use client";

import { useEffect, useRef, useState } from "react";

export type FlowTone = "coral" | "sky" | "lilac" | "butter" | "sage";
export type FlowStep = { title: string; body: string; tone: FlowTone };

const BUBBLE_TONE: Record<FlowTone, string> = {
  coral: "bg-coral text-white",
  sky: "bg-sky text-sky-text",
  lilac: "bg-lilac text-lilac-text",
  butter: "bg-butter text-butter-text",
  sage: "bg-sage text-sage-text",
};

const PING_TONE: Record<FlowTone, string> = {
  coral: "bg-coral",
  sky: "bg-sky-text",
  lilac: "bg-lilac-text",
  butter: "bg-butter-text",
  sage: "bg-sage-text",
};

const STEP_MS = 2200;

/**
 * Connected step bubbles that light up in sequence, looping while in view.
 * Pauses off-screen and respects prefers-reduced-motion (falls back to a
 * fully-lit static line, no cycling).
 */
export default function HowItWorksFlow({ steps }: { steps: FlowStep[] }) {
  const [active, setActive] = useState(0);
  const [inView, setInView] = useState(false);
  const [reduced, setReduced] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.4 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!inView || reduced) return;
    const id = setInterval(() => setActive((a) => (a + 1) % steps.length), STEP_MS);
    return () => clearInterval(id);
  }, [inView, reduced, steps.length]);

  const n = steps.length;
  const half = 50 / n;
  const progress = reduced ? 100 : (active / (n - 1)) * 100;

  return (
    <div ref={rootRef}>
      <div className="relative hidden md:block">
        <div className="absolute top-[22px]" style={{ left: `${half}%`, right: `${half}%` }}>
          <div className="h-0.5 rounded-full bg-sand" />
          <div
            className="absolute inset-y-0 left-0 h-0.5 rounded-full bg-gradient-to-r from-coral via-rose to-lilac-text transition-all duration-700 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <ol className="relative flex justify-between">
          {steps.map((step, i) => (
            <li key={step.title} className="flex w-full flex-col items-center px-2 text-center">
              <Bubble step={step} isActive={!reduced && i === active} number={i + 1} />
              <p className={`mt-3 text-sm font-semibold transition-colors ${!reduced && i === active ? "text-ink" : "text-ink-soft"}`}>
                {step.title}
              </p>
              <p className="mt-1 text-xs text-ink-soft">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>

      <div className="relative block pl-[22px] md:hidden">
        <div className="absolute left-[21px]" style={{ top: `${half}%`, bottom: `${half}%` }}>
          <div className="h-full w-0.5 rounded-full bg-sand" />
          <div
            className="absolute inset-x-0 top-0 w-0.5 rounded-full bg-gradient-to-b from-coral via-rose to-lilac-text transition-all duration-700 ease-out"
            style={{ height: `${progress}%` }}
          />
        </div>
        <ol className="relative space-y-6">
          {steps.map((step, i) => (
            <li key={step.title} className="flex items-start gap-3">
              <Bubble step={step} isActive={!reduced && i === active} number={i + 1} />
              <div className="pt-1.5">
                <p className={`text-sm font-semibold transition-colors ${!reduced && i === active ? "text-ink" : "text-ink-soft"}`}>
                  {step.title}
                </p>
                <p className="mt-0.5 text-xs text-ink-soft">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function Bubble({ step, isActive, number }: { step: FlowStep; isActive: boolean; number: number }) {
  return (
    <span className="relative flex h-11 w-11 shrink-0 items-center justify-center">
      {isActive && <span className={`absolute inset-0 rounded-full opacity-40 ${PING_TONE[step.tone]} animate-ping`} />}
      <span
        className={`relative flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold shadow-sm transition-all duration-300 ${BUBBLE_TONE[step.tone]} ${
          isActive ? "scale-110 shadow-lg" : "scale-100"
        }`}
      >
        {number}
      </span>
    </span>
  );
}
