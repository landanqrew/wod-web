import { Trophy } from "lucide-react";
import { getMovement } from "@/lib/domain/movements/library";
import { formatPRValue, relativeDay, titleCase } from "@/lib/format";
import type { PersonalRecord } from "@/lib/domain/models/workout-result";
import type { Workout } from "@/lib/domain/models/workout";
import { EmptyState } from "@/components/ui/card";

export function PRList({
  prs,
  workouts,
  limit = 6,
}: {
  prs: PersonalRecord[];
  workouts: Map<string, Workout>;
  limit?: number;
}) {
  if (prs.length === 0) {
    return (
      <EmptyState
        title="No PRs yet"
        hint="Log a benchmark or a heavy lift — records are detected automatically."
      />
    );
  }

  return (
    <div className="flex flex-col">
      {prs.slice(0, limit).map((pr) => {
        const label =
          pr.referenceType === "movement"
            ? (getMovement(pr.referenceId)?.name ?? pr.referenceId)
            : (workouts.get(pr.referenceId)?.name ?? pr.referenceId);

        return (
          <div
            key={pr.id}
            className="flex items-center gap-2.5 border-b border-border py-2 last:border-b-0"
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/12 text-primary">
              <Trophy size={14} />
            </span>
            <span className="min-w-0 flex-1">
              <b className="block truncate text-[13px] font-medium">{label}</b>
              <small className="block text-[11px] text-subtle">
                {titleCase(pr.category)} · {relativeDay(pr.achievedAt)}
              </small>
            </span>
            <span className="shrink-0 font-mono text-[13px] font-semibold">
              {pr.previousValue !== undefined ? (
                <small className="mr-1.5 font-normal text-subtle line-through">
                  {formatPRValue(pr.previousValue, pr.unit)}
                </small>
              ) : null}
              {formatPRValue(pr.value, pr.unit)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
