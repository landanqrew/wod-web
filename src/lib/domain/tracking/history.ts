import type { WorkoutResult } from "../models/workout-result";

/**
 * In-memory stand-in for the CLI's `ResultRepository.getByDateRange`.
 * The web app loads an athlete's history once per request and hands it to the
 * analyzers, so the trackers stay pure and testable.
 *
 * Ordering matches the SQL repository: newest first.
 */
export function filterByDateRange(
  results: WorkoutResult[],
  startDate: string,
  endDate: string
): WorkoutResult[] {
  return results
    .filter((r) => r.performedAt >= startDate && r.performedAt <= endDate)
    .sort((a, b) => b.performedAt.localeCompare(a.performedAt));
}
