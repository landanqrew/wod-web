import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { cn } from "@/lib/utils";

export type InsightTone = "ok" | "warn" | "danger" | "info";

const TONES: Record<InsightTone, string> = {
  ok: "border-ok/30 bg-ok/8 text-ok",
  warn: "border-warn/30 bg-warn/8 text-warn",
  danger: "border-danger/30 bg-danger/8 text-danger",
  info: "border-border-hi bg-muted text-muted-fg",
};

const ICONS = {
  ok: CheckCircle2,
  warn: AlertTriangle,
  danger: AlertTriangle,
  info: Info,
} as const;

/** Maps the domain analyzers' severities onto the app's semantic tones. */
export function toneFor(severity: string): InsightTone {
  switch (severity) {
    case "good":
      return "ok";
    case "caution":
    case "warning":
      return severity === "caution" ? "warn" : "danger";
    case "alert":
      return "danger";
    case "info":
      return "info";
    default:
      return "warn";
  }
}

export function InsightCard({
  tone,
  message,
  recommendation,
  className,
}: {
  tone: InsightTone;
  message: string;
  recommendation?: string;
  className?: string;
}) {
  const Icon = ICONS[tone];
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-[13px]",
        TONES[tone],
        className
      )}
    >
      <Icon size={15} className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        <b className="font-semibold">{message}</b>
        {recommendation ? (
          <p className="mt-0.5 text-xs opacity-80">{recommendation}</p>
        ) : null}
      </div>
    </div>
  );
}
