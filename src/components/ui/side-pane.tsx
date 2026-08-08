"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Right slide-in editing surface. Full pages handle generation and detail
 * views; this handles logging and quick edits without losing context.
 */
export function SidePane({
  open,
  onClose,
  title,
  subtitle,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-[1px] animate-in fade-in"
        onClick={onClose}
      />
      <aside
        className={cn(
          "relative flex h-full w-full max-w-[440px] flex-col rounded-l-2xl border-l border-border",
          "bg-card shadow-panel animate-in slide-in-from-right duration-200"
        )}
      >
        <header className="flex items-start gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[15px] font-bold">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-xs text-subtle">{subtitle}</p> : null}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="cursor-pointer rounded-full p-1.5 text-muted-fg transition hover:bg-muted hover:text-ink"
          >
            <X size={16} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <footer className="flex items-center justify-end gap-2 border-t border-border px-5 py-3.5">
            {footer}
          </footer>
        ) : null}
      </aside>
    </div>
  );
}
