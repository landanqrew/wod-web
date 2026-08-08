"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { MOVEMENT_LIBRARY } from "@/lib/domain/movements/library";
import { BENCHMARK_LIBRARY } from "@/lib/domain/generator/benchmark-library";
import { NAV_ITEMS } from "./nav";
import { cn } from "@/lib/utils";

type Entry = { id: string; label: string; kind: string; href: string };

const ENTRIES: Entry[] = [
  ...NAV_ITEMS.map((n) => ({ id: n.href, label: n.label, kind: "Page", href: n.href })),
  ...MOVEMENT_LIBRARY.map((m) => ({
    id: `m_${m.id}`,
    label: m.name,
    kind: "Movement",
    href: `/movements/${m.id}`,
  })),
  ...BENCHMARK_LIBRARY.map((b) => ({
    id: `b_${b.id}`,
    label: b.name,
    kind: "Benchmark",
    href: `/benchmarks/${b.id}`,
  })),
];

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ENTRIES.filter((e) => e.kind === "Page");
    return ENTRIES.filter((e) => e.label.toLowerCase().includes(q)).slice(0, 24);
  }, [query]);

  function go(entry: Entry) {
    setOpen(false);
    setQuery("");
    router.push(entry.href);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="ml-auto flex h-9 min-w-[240px] cursor-pointer items-center gap-2 rounded-full border border-border bg-muted px-3.5 text-[13px] text-subtle transition hover:border-border-hi hover:text-muted-fg max-md:min-w-0"
      >
        <Search size={14} />
        <span className="max-md:hidden">Search movements, benchmarks…</span>
        <kbd className="ml-auto rounded-full border border-border-hi bg-card-hi px-2 py-0.5 font-mono text-[11px] max-md:hidden">
          ⌘K
        </kbd>
      </button>

      {open ? (
        <div className="fixed inset-0 z-60 flex items-start justify-center px-4 pt-[12vh]">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-border-hi bg-card shadow-lift animate-in fade-in slide-in-from-top-2 duration-150">
            <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
              <Search size={16} className="text-subtle" />
              <input
                autoFocus
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setActive((i) => Math.min(i + 1, results.length - 1));
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setActive((i) => Math.max(i - 1, 0));
                  }
                  if (e.key === "Enter" && results[active]) go(results[active]);
                }}
                placeholder="Search movements, benchmarks, pages…"
                className="w-full bg-transparent text-sm outline-none placeholder:text-subtle"
              />
            </div>
            <div className="max-h-80 overflow-y-auto py-1.5">
              {results.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-subtle">No matches</p>
              ) : (
                results.map((entry, i) => (
                  <button
                    key={entry.id}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(entry)}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-3 px-4 py-2 text-left text-sm",
                      i === active ? "bg-primary/10 text-primary" : "text-ink"
                    )}
                  >
                    <span className="flex-1 truncate">{entry.label}</span>
                    <span className="font-mono text-[10px] uppercase tracking-wide text-subtle">
                      {entry.kind}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
