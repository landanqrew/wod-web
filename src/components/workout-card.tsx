import * as React from "react";
import { Pill } from "@/components/ui/pill";
import { getMovement } from "@/lib/domain/movements/library";
import { formatLabel, titleCase } from "@/lib/format";
import type { Workout } from "@/lib/domain/models/workout";
import { cn } from "@/lib/utils";

/**
 * The "whiteboard": one composed card holding the day's prescription.
 * Reps stay in a volt column so the eye lands on the work, not the chrome.
 */
export function WorkoutCard({
  workout,
  headerRight,
  footer,
  note,
  className,
}: {
  workout: Workout;
  headerRight?: React.ReactNode;
  footer?: React.ReactNode;
  note?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl border border-border bg-card shadow-soft", className)}>
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-extrabold tracking-tight">{workout.name}</h2>
          <p className="mt-0.5 font-mono text-[11px] text-subtle">{workout.id}</p>
        </div>
        {headerRight}
      </div>

      <div className="flex flex-wrap gap-1.5 px-5 pt-3.5">
        <Pill tone="format">{formatLabel(workout.format)}</Pill>
        {workout.rounds ? <Pill tone="neutral">{workout.rounds} rounds</Pill> : null}
        {workout.timeCap ? <Pill tone="neutral">Cap {workout.timeCap}:00</Pill> : null}
        {workout.emomMinutes ? <Pill tone="neutral">{workout.emomMinutes} min</Pill> : null}
        {workout.workInterval ? (
          <Pill tone="neutral">
            {workout.workInterval}s on / {workout.restInterval ?? 0}s off
          </Pill>
        ) : null}
        <Pill tone="neutral">Score: {titleCase(workout.scoreType)}</Pill>
      </div>

      {workout.description ? (
        <p className="px-5 pt-2.5 text-[13px] text-muted-fg">{workout.description}</p>
      ) : null}

      <ul className="mt-3 divide-y divide-border border-y border-border">
        {workout.movements.map((p, i) => {
          const movement = p.movement ?? getMovement(p.movementId);
          const quantity =
            p.reps !== undefined
              ? String(p.reps)
              : p.calories !== undefined
                ? `${p.calories} cal`
                : p.distance !== undefined
                  ? `${p.distance} m`
                  : p.duration !== undefined
                    ? `${p.duration}s`
                    : "—";
          return (
            <li key={`${p.movementId}_${i}`} className="flex items-baseline gap-3 px-5 py-2.5">
              <span className="w-16 shrink-0 font-mono text-[15px] font-bold text-primary">
                {quantity}
              </span>
              <span className="min-w-0 flex-1">
                <b className="font-medium">{movement?.name ?? p.movementId}</b>
                {p.notes ? (
                  <small className="ml-2 text-[11px] text-subtle">{p.notes}</small>
                ) : null}
              </span>
              {p.load ? (
                <span className="shrink-0 font-mono text-[13px] text-muted-fg">{p.load} lb</span>
              ) : null}
            </li>
          );
        })}
      </ul>

      {note ? <div className="px-5 pt-3">{note}</div> : null}
      {footer ? (
        <div className="flex flex-wrap items-center gap-2 px-5 py-3.5">{footer}</div>
      ) : null}
    </div>
  );
}
