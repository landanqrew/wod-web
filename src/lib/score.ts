import { ScoreType } from "@/lib/domain/models/workout";
import type { WorkoutResult } from "@/lib/domain/models/workout-result";

/** Comparable magnitude for non-time scores (rounds dominate, per the CLI). */
export function scoreValue(r: WorkoutResult): number {
  return (
    (r.roundsCompleted ?? 0) * 1000 +
    (r.partialReps ?? 0) +
    (r.peakLoad ?? 0) +
    (r.totalReps ?? 0) +
    (r.totalCalories ?? 0) +
    (r.totalDistance ?? 0)
  );
}

/** Fastest time, or the biggest score for every other scoring model. */
export function bestResult(attempts: WorkoutResult[]): WorkoutResult | undefined {
  if (attempts.length === 0) return undefined;
  return [...attempts].sort((a, b) =>
    a.scoreType === ScoreType.Time
      ? (a.timeSeconds ?? Infinity) - (b.timeSeconds ?? Infinity)
      : scoreValue(b) - scoreValue(a)
  )[0];
}
