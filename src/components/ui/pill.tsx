import * as React from "react";
import { cn } from "@/lib/utils";

type Tone = "rx" | "scaled" | "pr" | "format" | "ok" | "warn" | "danger" | "neutral";

const TONES: Record<Tone, string> = {
  rx: "border-primary/35 bg-primary/10 text-primary",
  scaled: "border-warn/35 bg-warn/10 text-warn",
  pr: "border-primary/50 bg-primary text-on-primary font-semibold",
  format: "border-border-hi bg-muted text-muted-fg font-mono text-[10px] uppercase tracking-wide",
  ok: "border-ok/30 bg-ok/8 text-ok",
  warn: "border-warn/30 bg-warn/8 text-warn",
  danger: "border-danger/30 bg-danger/8 text-danger",
  neutral: "border-border-hi bg-muted text-muted-fg",
};

export function Pill({
  tone = "neutral",
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        TONES[tone],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
