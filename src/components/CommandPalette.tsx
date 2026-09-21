"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SOURCES_TAB, tabLock, TOOL_TABS, type ProfileNavSummary } from "@/lib/profileStatus";

type Command = { id: string; label: string; group: string; href: string };

export default function CommandPalette({ profiles }: { profiles: ProfileNavSummary[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useMemo<Command[]>(() => {
    const base: Command[] = [
      { id: "home", label: "Dashboard (Home)", group: "Go to", href: "/" },
      { id: "new-profile", label: "New profile", group: "Create", href: "/profile/new" },
    ];
    const profileCommands = profiles.flatMap((p) => {
      const sections = [...TOOL_TABS.filter((t) => !tabLock(t, p)), SOURCES_TAB];
      return [
        { id: `p-${p.id}`, label: p.name, group: "Profiles", href: `/profile/${p.id}` },
        ...sections.map((section) => ({
          id: `p-${p.id}-${section}`,
          label: `${p.name} → ${section}`,
          group: "Profiles",
          href: `/profile/${p.id}?tab=${encodeURIComponent(section)}`,
        })),
      ];
    });
    return [...base, ...profileCommands];
  }, [profiles]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands.slice(0, 8);
    return commands.filter((c) => c.label.toLowerCase().includes(q)).slice(0, 12);
  }, [commands, query]);

  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, []);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting the palette's own transient UI state on open, not derived data
      setQuery("");
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  function go(cmd: Command) {
    router.push(cmd.href);
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink/30 px-4 pt-[15vh]" onClick={() => setOpen(false)}>
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border border-sand bg-white shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActiveIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter" && filtered[activeIndex]) {
              go(filtered[activeIndex]);
            }
          }}
          placeholder="Jump to a profile, section, or page..."
          className="w-full border-b border-sand px-4 py-3 text-sm text-ink placeholder:text-ink-soft focus:outline-none"
        />
        <div className="max-h-80 overflow-y-auto p-1.5">
          {filtered.length === 0 ? (
            <p className="px-3 py-4 text-sm text-ink-soft">No matches.</p>
          ) : (
            filtered.map((cmd, i) => (
              <button
                key={cmd.id}
                onClick={() => go(cmd)}
                onMouseEnter={() => setActiveIndex(i)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
                  i === activeIndex ? "bg-peach text-coral-dark" : "text-ink hover:bg-cream-soft"
                }`}
              >
                <span>{cmd.label}</span>
                <span className="text-xs text-ink-soft">{cmd.group}</span>
              </button>
            ))
          )}
        </div>
        <div className="border-t border-sand px-4 py-2 text-xs text-ink-soft">↑↓ to navigate · Enter to select · Esc to close</div>
      </div>
    </div>
  );
}
