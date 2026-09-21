"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import Logo from "./Logo";
import { resolveTab, SOURCES_TAB, tabLock, TOOL_TABS, type ProfileNavSummary } from "@/lib/profileStatus";

export default function Sidebar({ profiles }: { profiles: ProfileNavSummary[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- closing the mobile drawer in response to a route change, not derived render state
    setOpen(false);
  }, [pathname, requestedTab]);

  function renderProfile(p: ProfileNavSummary) {
    const active = pathname === `/profile/${p.id}`;
    const activeTab = active ? resolveTab(requestedTab, p) : null;
    return (
      <div key={p.id}>
        <Link
          href={`/profile/${p.id}`}
          className={`block truncate rounded-lg px-2.5 py-1.5 text-sm font-medium transition ${
            active ? "bg-peach text-coral-dark" : "text-ink hover:bg-cream-soft"
          }`}
        >
          {p.name}
        </Link>
        {active && (
          <div className="ml-2.5 mt-1 flex flex-col gap-0.5 border-l border-sand pl-2.5">
            {TOOL_TABS.map((t) => {
              const lock = tabLock(t, p);
              if (lock) {
                return (
                  <span
                    key={t}
                    title={lock}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-ink-soft/40"
                  >
                    🔒 {t}
                  </span>
                );
              }
              return (
                <Link
                  key={t}
                  href={`/profile/${p.id}?tab=${encodeURIComponent(t)}`}
                  scroll={false}
                  className={`rounded-md px-2 py-1 text-xs font-medium transition ${
                    activeTab === t ? "bg-coral text-white" : "text-ink-soft hover:bg-cream-soft hover:text-ink"
                  }`}
                >
                  {t}
                </Link>
              );
            })}
            <Link
              href={`/profile/${p.id}?tab=${encodeURIComponent(SOURCES_TAB)}`}
              scroll={false}
              className={`mt-1 flex items-center gap-1 rounded-md border-t border-sand px-2 pt-1.5 pb-1 text-xs font-medium transition ${
                activeTab === SOURCES_TAB ? "text-coral-dark" : "text-ink-soft hover:text-ink"
              }`}
            >
              ⚙ Sources{!p.hasSources && " (required)"}
            </Link>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="sticky top-0 z-30 flex items-center gap-2 border-b border-sand bg-white/90 px-3 py-2.5 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="rounded-lg p-1.5 text-ink hover:bg-cream-soft"
        >
          ☰
        </button>
        <Link href="/" className="flex items-center gap-2 text-base font-bold tracking-tight text-ink">
          <Logo size={26} />
          Bink
        </Link>
      </div>

      {open && <div className="fixed inset-0 z-40 bg-ink/30 lg:hidden" onClick={() => setOpen(false)} aria-hidden />}

      <aside
        className={`fixed inset-y-0 left-0 z-50 h-screen w-60 shrink-0 overflow-y-auto border-r border-sand bg-white px-3 py-5 transition-transform duration-200 lg:sticky lg:top-0 lg:z-auto lg:translate-x-0 lg:bg-white/70 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Link href="/" className="mb-1 flex items-center gap-2 px-2 text-base font-bold tracking-tight text-ink">
          <Logo size={32} />
          Bink
        </Link>
        <p className="-mt-1 mb-1 px-2 text-[11px] text-ink-soft">Your personal content strategist</p>
        <p className="mb-4 px-2 text-xs text-ink-soft">Press ⌘K to jump anywhere</p>

        <nav className="mb-5 flex flex-col gap-1">
          <Link
            href="/profile/new"
            className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-ink-soft transition hover:bg-cream-soft hover:text-ink"
          >
            + New profile
          </Link>
        </nav>

        <div>
          <p className="mb-1.5 px-2 text-xs font-bold uppercase tracking-wide text-ink-soft">Profiles</p>
          <div className="flex flex-col gap-0.5">
            {profiles.length === 0 ? (
              <p className="px-2 text-xs text-ink-soft">None yet</p>
            ) : (
              profiles.map(renderProfile)
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
