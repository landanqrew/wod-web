import * as React from "react";
import { Card } from "@/components/ui/card";
import { prescriptionLine, titleCase } from "@/lib/format";
import type { SessionBlock, TrainingSession } from "@/lib/domain/models/workout";
import { cn } from "@/lib/utils";

/** Block strip for a built session — warm-up → work → cool-down. */
export function SessionView({
  session,
  title = "Full session",
  action,
}: {
  session: TrainingSession;
  title?: string;
  action?: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="text-[15px] font-bold">{title}</h3>
        <span className="flex items-center gap-3">
          <span className="font-mono text-xs text-subtle">
            {session.totalDurationMinutes} min total
          </span>
          {action}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {session.blocks.map((block: SessionBlock, i) => (
          <div
            key={i}
            className={cn(
              "flex items-start gap-3 rounded-xl border px-3.5 py-2.5",
              block.type === "metcon" || block.type === "strength"
                ? "border-primary/40 bg-primary/8"
                : "border-border bg-app"
            )}
          >
            <span
              className={cn(
                "w-24 shrink-0 text-[11px] font-semibold uppercase tracking-[0.07em]",
                block.type === "metcon" || block.type === "strength"
                  ? "text-primary"
                  : "text-subtle"
              )}
            >
              {titleCase(block.type)}
            </span>
            <span className="min-w-0 flex-1 text-[13px] text-muted-fg">
              {block.workout ? (
                <b className="block text-ink">{block.workout.name}</b>
              ) : null}
              {block.workout?.movements.length ? (
                <span className="mt-1 block font-mono text-[12px] text-muted-fg">
                  {block.workout.movements.map(prescriptionLine).join(" · ")}
                </span>
              ) : null}
              {block.notes ? (
                <span className="mt-0.5 block whitespace-pre-line text-[12px]">{block.notes}</span>
              ) : null}
            </span>
            <span className="shrink-0 font-mono text-[12px] text-subtle">
              {block.durationMinutes} min
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
