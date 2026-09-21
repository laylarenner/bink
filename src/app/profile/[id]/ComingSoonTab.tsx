const COPY: Record<string, { title: string; body: string }> = {
  Posts: {
    title: "Posts",
    body: "Pick ideas and get LinkedIn and X posts written in your voice, grounded in your strategy and your real writing samples. Approve a draft and it is scheduled and posted for you automatically, at the best time, with nothing left for you to do.",
  },
};

export default function ComingSoonTab({ tab }: { tab: string }) {
  const copy = COPY[tab] ?? { title: tab, body: "" };
  return (
    <div className="max-w-xl rounded-xl border border-dashed border-sand bg-cream-soft px-6 py-8">
      <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">Next build step</p>
      <h2 className="mt-1 text-lg font-bold text-ink">{copy.title}</h2>
      <p className="mt-2 text-sm text-ink-soft">{copy.body}</p>
    </div>
  );
}
