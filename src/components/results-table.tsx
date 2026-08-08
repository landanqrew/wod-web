import Link from "next/link";
import { Pill } from "@/components/ui/pill";
import { EmptyState } from "@/components/ui/card";
import { EM_DASH, formatLabel, formatScore, formatShortDate } from "@/lib/format";
import type { Workout } from "@/lib/domain/models/workout";
import type { PersonalRecord, WorkoutResult } from "@/lib/domain/models/workout-result";

export function ResultsTable({
  results,
  workouts,
  prs,
  emptyHint,
}: {
  results: WorkoutResult[];
  workouts: Map<string, Workout>;
  prs: PersonalRecord[];
  emptyHint?: string;
}) {
  const prResultIds = new Set(prs.map((p) => p.workoutResultId).filter(Boolean));

  if (results.length === 0) {
    return (
      <EmptyState
        title="No results logged yet"
        hint={emptyHint ?? "Generate a workout, then log what you actually did."}
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="table-head-cell">Workout</th>
            <th className="table-head-cell">Format</th>
            <th className="table-head-cell">Date</th>
            <th className="table-head-cell text-right">Score</th>
            <th className="table-head-cell text-right">RPE</th>
            <th className="table-head-cell">Tags</th>
          </tr>
        </thead>
        <tbody>
          {results.map((result) => {
            const workout = workouts.get(result.workoutId);
            return (
              <tr key={result.id} className="data-row group">
                <td className="px-3 py-1.5">
                  <Link href={`/history/${result.id}`} className="block font-medium">
                    {workout?.name ?? "Workout"}
                  </Link>
                </td>
                <td className="px-3 py-1.5">
                  {workout ? (
                    <Pill tone="format">{formatLabel(workout.format)}</Pill>
                  ) : (
                    <span className="text-subtle">{EM_DASH}</span>
                  )}
                </td>
                <td className="px-3 py-1.5 font-mono text-[13px] text-muted-fg">
                  {formatShortDate(result.performedAt)}
                </td>
                <td className="px-3 py-1.5 text-right font-mono text-[13px] font-semibold">
                  {formatScore(result)}
                </td>
                <td className="px-3 py-1.5 text-right font-mono text-[13px] text-muted-fg">
                  {result.rpe ?? <span className="text-subtle">{EM_DASH}</span>}
                </td>
                <td className="px-3 py-1.5">
                  <span className="flex flex-wrap items-center gap-1.5">
                    {result.rx ? (
                      <Pill tone="rx">Rx</Pill>
                    ) : (
                      <Pill tone="scaled">
                        {result.scalingTier ? formatTier(result.scalingTier) : "Scaled"}
                      </Pill>
                    )}
                    {prResultIds.has(result.id) ? <Pill tone="pr">PR</Pill> : null}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function formatTier(tier: string) {
  return tier === "rx_plus" ? "Rx+" : tier.charAt(0).toUpperCase() + tier.slice(1);
}
