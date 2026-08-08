import "server-only";
import { getPRs, getResults, getWorkoutsForResults } from "./training";
import { VolumeTracker } from "@/lib/domain/tracking/volume-tracker";
import { BiasDetector } from "@/lib/domain/tracking/bias-detector";
import { FatigueTracker } from "@/lib/domain/tracking/fatigue-tracker";
import type { Workout } from "@/lib/domain/models/workout";
import type { PersonalRecord, WorkoutResult } from "@/lib/domain/models/workout-result";

export type TrainingSnapshot = {
  results: WorkoutResult[];
  workouts: Map<string, Workout>;
  prs: PersonalRecord[];
  volume: VolumeTracker;
  bias: BiasDetector;
  fatigue: FatigueTracker;
};

/** One load of an athlete's history, shared by the dashboard/progress/insights. */
export async function loadTrainingSnapshot(athleteId: string): Promise<TrainingSnapshot> {
  const results = await getResults(athleteId);
  const [workouts, prs] = await Promise.all([
    getWorkoutsForResults(results),
    getPRs(athleteId),
  ]);

  return {
    results,
    workouts: new Map(workouts.map((w) => [w.id, w])),
    prs,
    volume: new VolumeTracker(results),
    bias: new BiasDetector(results, workouts),
    fatigue: new FatigueTracker(results),
  };
}

/** Weekly volume buckets (oldest first) for sparklines and bar charts. */
export function weeklyVolume(
  results: WorkoutResult[],
  weeks = 8
): { label: string; value: number; workouts: number }[] {
  const buckets: { label: string; value: number; workouts: number }[] = [];
  const now = new Date();

  for (let i = weeks - 1; i >= 0; i--) {
    const end = new Date(now);
    end.setDate(end.getDate() - i * 7);
    const start = new Date(end);
    start.setDate(start.getDate() - 7);

    const inWeek = results.filter((r) => {
      const at = new Date(r.performedAt);
      return at > start && at <= end;
    });

    const volume = inWeek.reduce(
      (sum, r) =>
        sum +
        r.movementResults.reduce((s, m) => s + (m.load ?? 0) * (m.reps ?? (m.load ? 1 : 0)), 0),
      0
    );

    buckets.push({
      label: end.toLocaleDateString("en-US", { month: "numeric", day: "numeric" }),
      value: volume,
      workouts: inWeek.length,
    });
  }

  return buckets;
}

/**
 * Acute:chronic workload ratio — last 7 days of volume against the trailing
 * 28-day weekly average. Above ~1.5 is the classic ramping-too-fast signal.
 */
export function acwr(results: WorkoutResult[]): number | null {
  const now = Date.now();
  const volumeSince = (days: number) =>
    results
      .filter((r) => now - new Date(r.performedAt).getTime() <= days * 86_400_000)
      .reduce(
        (sum, r) =>
          sum +
          r.movementResults.reduce((s, m) => s + (m.load ?? 0) * (m.reps ?? (m.load ? 1 : 0)), 0),
        0
      );

  const acute = volumeSince(7);
  const chronic = volumeSince(28) / 4;
  if (chronic <= 0) return null;
  return Math.round((acute / chronic) * 10) / 10;
}

/** PRs set within the last `days` days. Kept out of components so render stays pure. */
export function recentPRs(prs: PersonalRecord[], days = 30): PersonalRecord[] {
  const cutoff = Date.now() - days * 86_400_000;
  return prs.filter((pr) => new Date(pr.achievedAt).getTime() >= cutoff);
}
