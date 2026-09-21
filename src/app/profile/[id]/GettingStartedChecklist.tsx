import Link from "next/link";

type Step = { label: string; done: boolean; href: string; cta: string };

export default function GettingStartedChecklist({
  profileId,
  hasSources,
  hasSummary,
  hasStrategy,
}: {
  profileId: string;
  hasSources: boolean;
  hasSummary: boolean;
  hasStrategy: boolean;
}) {
  const steps: Step[] = [
    {
      label: "Connect your GitHub, X or LinkedIn, then build your profile",
      done: hasSummary,
      href: `/profile/${profileId}?tab=Sources`,
      cta: hasSources ? "Build my profile" : "Connect sources",
    },
    {
      label: "Lock in your strategy with Bink",
      done: hasStrategy,
      href: `/profile/${profileId}?tab=Strategy`,
      cta: "Build strategy",
    },
    {
      label: "Pick an idea and write your first post",
      done: false,
      href: `/profile/${profileId}?tab=Posts`,
      cta: "Write a post",
    },
  ];

  if (steps.every((s) => s.done)) return null;

  return (
    <div className="mb-8 rounded-xl border border-coral/30 bg-peach/40 p-5">
      <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-coral-dark">Get started: three steps</h3>
      <ul className="space-y-2.5">
        {steps.map((step, i) => {
          const unlocked = i === 0 || steps[i - 1].done;
          return (
            <li key={step.label} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    step.done ? "bg-sage text-sage-text" : "border border-sand bg-white text-ink-soft"
                  }`}
                >
                  {step.done ? "✓" : ""}
                </span>
                <span className={`text-sm ${step.done ? "text-ink-soft line-through" : "text-ink"}`}>{step.label}</span>
              </div>
              {!step.done && unlocked && (
                <Link href={step.href} scroll={false} className="shrink-0 text-xs font-semibold text-coral-dark hover:underline">
                  {step.cta} →
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
