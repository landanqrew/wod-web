import type { WorkoutResult } from "../models/workout-result";
import type { Workout } from "../models/workout";
import { Modality, MovementPattern, Muscle } from "../models/body";
import { getMovement } from "../movements/library";
import { filterByDateRange } from "./history";

/**
 * A single bias insight with severity and recommendation.
 */
export interface BiasInsight {
  category:
    | "modality"
    | "muscle"
    | "movement_pattern"
    | "movement"
    | "format"
    | "frequency";
  severity: "info" | "warning" | "alert";
  message: string;
  recommendation: string;
}

/**
 * Full bias report for an athlete's training.
 */
export interface BiasReport {
  /** Period analyzed */
  periodDays: number;
  totalWorkouts: number;
  insights: BiasInsight[];
  /** Distribution of modalities as percentages */
  modalityDistribution: Record<string, number>;
  /** Distribution of trained Muscles as percentages */
  muscleDistribution: Record<string, number>;
  /** Distribution of Movement Patterns as percentages */
  movementPatternDistribution: Record<string, number>;
  /** Movements sorted by frequency (most used first) */
  movementFrequency: { movementId: string; name: string; count: number }[];
  /** Workout format distribution */
  formatDistribution: Record<string, number>;
}

/**
 * Analyzes training history for programming biases and gaps.
 */
export class BiasDetector {
  private workoutsById: Map<string, Workout>;

  /**
   * @param results the athlete's full logged history
   * @param workouts every workout referenced by those results
   */
  constructor(
    private results: WorkoutResult[],
    workouts: Workout[]
  ) {
    this.workoutsById = new Map(workouts.map((w) => [w.id, w]));
  }

  /**
   * Analyze an athlete's training over a period for biases.
   */
  analyze(periodDays: number = 30): BiasReport {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - periodDays);

    const results = filterByDateRange(
      this.results,
      start.toISOString(),
      end.toISOString()
    );

    const insights: BiasInsight[] = [];

    // Collect all movement IDs and resolve metadata
    const modalityCounts = new Map<string, number>();
    const muscleCounts = new Map<string, number>();
    const movementPatternCounts = new Map<string, number>();
    const movementCounts = new Map<string, number>();
    const formatCounts = new Map<string, number>();

    for (const result of results) {
      // Count workout format
      const workout = this.workoutsById.get(result.workoutId);
      if (workout) {
        formatCounts.set(
          workout.format,
          (formatCounts.get(workout.format) ?? 0) + 1
        );
      }

      // Count movements, modalities, and Movement Patterns
      for (const mr of result.movementResults) {
        movementCounts.set(
          mr.movementId,
          (movementCounts.get(mr.movementId) ?? 0) + 1
        );

        const movement = getMovement(mr.movementId);
        if (movement) {
          modalityCounts.set(
            movement.modality,
            (modalityCounts.get(movement.modality) ?? 0) + 1
          );
          for (const mg of movement.movementPatterns) {
            movementPatternCounts.set(mg, (movementPatternCounts.get(mg) ?? 0) + 1);
          }
          for (const muscle of [
            ...movement.primaryMuscles,
            ...movement.secondaryMuscles,
          ]) {
            muscleCounts.set(muscle, (muscleCounts.get(muscle) ?? 0) + 1);
          }
        }
      }
    }

    // Build distributions
    const modalityTotal = sumValues(modalityCounts);
    const modalityDistribution: Record<string, number> = {};
    for (const mod of Object.values(Modality)) {
      modalityDistribution[mod] = modalityTotal > 0
        ? Math.round(((modalityCounts.get(mod) ?? 0) / modalityTotal) * 100)
        : 0;
    }

    const movementPatternTotal = sumValues(movementPatternCounts);
    const movementPatternDistribution: Record<string, number> = {};
    for (const mg of Object.values(MovementPattern)) {
      movementPatternDistribution[mg] = movementPatternTotal > 0
        ? Math.round(((movementPatternCounts.get(mg) ?? 0) / movementPatternTotal) * 100)
        : 0;
    }

    const muscleTotal = sumValues(muscleCounts);
    const muscleDistribution: Record<string, number> = {};
    for (const muscle of Object.values(Muscle)) {
      muscleDistribution[muscle] =
        muscleTotal > 0
          ? Math.round(((muscleCounts.get(muscle) ?? 0) / muscleTotal) * 100)
          : 0;
    }

    const formatDistribution: Record<string, number> = {};
    for (const [fmt, count] of formatCounts) {
      formatDistribution[fmt] = results.length > 0
        ? Math.round((count / results.length) * 100)
        : 0;
    }

    const movementFrequency = [...movementCounts.entries()]
      .map(([id, count]) => ({
        movementId: id,
        name: getMovement(id)?.name ?? id,
        count,
      }))
      .sort((a, b) => b.count - a.count);

    // Generate insights only if there's enough data
    if (results.length >= 3) {
      insights.push(...this.detectModalityBias(modalityCounts, modalityTotal, periodDays));
      insights.push(...this.detectMovementPatternBias(movementPatternCounts, movementPatternTotal, periodDays));
      insights.push(...this.detectMovementBias(movementCounts, results.length));
      insights.push(...this.detectFormatBias(formatCounts, results.length));
      insights.push(...this.detectFrequencyPatterns(results, periodDays));
    } else if (results.length > 0) {
      insights.push({
        category: "frequency",
        severity: "info",
        message: `Only ${results.length} workout(s) in the last ${periodDays} days`,
        recommendation: "Log more workouts for meaningful bias analysis.",
      });
    }

    return {
      periodDays,
      totalWorkouts: results.length,
      insights,
      modalityDistribution,
      muscleDistribution,
      movementPatternDistribution,
      movementFrequency,
      formatDistribution,
    };
  }

  private detectModalityBias(
    counts: Map<string, number>,
    total: number,
    periodDays: number
  ): BiasInsight[] {
    const insights: BiasInsight[] = [];
    if (total === 0) return insights;

    const allModalities = Object.values(Modality);

    // Check for missing modalities
    for (const mod of allModalities) {
      const count = counts.get(mod) ?? 0;
      const pct = (count / total) * 100;

      if (count === 0) {
        insights.push({
          category: "modality",
          severity: periodDays >= 14 ? "alert" : "warning",
          message: `No ${mod} movements in the last ${periodDays} days`,
          recommendation: `Add ${mod} work to your programming for balanced fitness.`,
        });
      } else if (pct > 60) {
        insights.push({
          category: "modality",
          severity: "warning",
          message: `${Math.round(pct)}% of movements are ${mod} (${count}/${total})`,
          recommendation: `Consider adding more variety outside of ${mod}.`,
        });
      }
    }

    return insights;
  }

  private detectMovementPatternBias(
    counts: Map<string, number>,
    total: number,
    periodDays: number
  ): BiasInsight[] {
    const insights: BiasInsight[] = [];
    if (total === 0) return insights;

    const allGroups = Object.values(MovementPattern);
    const groupLabels: Record<string, string> = {
      push: "pushing (press, push-up, dip)",
      pull: "pulling (pull-up, row, clean)",
      squat: "squatting (squat, lunge)",
      hinge: "hinging (deadlift, swing, snatch)",
      core: "core (sit-up, plank, T2B)",
      carry: "carrying (farmer's carry, sandbag)",
    };

    for (const mg of allGroups) {
      const count = counts.get(mg) ?? 0;
      const pct = (count / total) * 100;

      if (count === 0 && periodDays >= 14) {
        insights.push({
          category: "movement_pattern",
          severity: "alert",
          message: `No ${groupLabels[mg] ?? mg} in the last ${periodDays} days`,
          recommendation: `Include ${mg} movements in upcoming workouts.`,
        });
      } else if (pct > 40 && total >= 10) {
        insights.push({
          category: "movement_pattern",
          severity: "warning",
          message: `${Math.round(pct)}% of volume is ${mg} movements`,
          recommendation: `Balance your programming with more variety across Movement Patterns.`,
        });
      }
    }

    // Check push/pull balance
    const pushCount = counts.get(MovementPattern.Push) ?? 0;
    const pullCount = counts.get(MovementPattern.Pull) ?? 0;
    if (pushCount > 0 && pullCount > 0) {
      const ratio = pushCount / pullCount;
      if (ratio > 2) {
        insights.push({
          category: "movement_pattern",
          severity: "warning",
          message: `Push-to-pull ratio is ${ratio.toFixed(1)}:1 (${pushCount} push vs ${pullCount} pull)`,
          recommendation: "Add more pulling movements (rows, pull-ups, cleans) for shoulder health.",
        });
      } else if (ratio < 0.5) {
        insights.push({
          category: "movement_pattern",
          severity: "info",
          message: `Pull-to-push ratio is ${(1/ratio).toFixed(1)}:1 (${pullCount} pull vs ${pushCount} push)`,
          recommendation: "Consider adding more pressing movements for balance.",
        });
      }
    }

    return insights;
  }

  private detectMovementBias(
    counts: Map<string, number>,
    totalWorkouts: number
  ): BiasInsight[] {
    const insights: BiasInsight[] = [];

    // Check for over-reliance on specific movements
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);

    if (sorted.length > 0 && totalWorkouts >= 5) {
      const topMovement = sorted[0];
      const topPct = (topMovement[1] / totalWorkouts) * 100;
      const name = getMovement(topMovement[0])?.name ?? topMovement[0];

      if (topPct > 70) {
        insights.push({
          category: "movement",
          severity: "warning",
          message: `${name} appears in ${Math.round(topPct)}% of workouts (${topMovement[1]}/${totalWorkouts})`,
          recommendation: `Rotate in substitutions to reduce overuse risk.`,
        });
      }
    }

    return insights;
  }

  private detectFormatBias(
    counts: Map<string, number>,
    totalWorkouts: number
  ): BiasInsight[] {
    const insights: BiasInsight[] = [];
    if (totalWorkouts < 5) return insights;

    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);

    // Check if one format dominates
    if (sorted.length > 0) {
      const topFormat = sorted[0];
      const topPct = (topFormat[1] / totalWorkouts) * 100;

      if (topPct > 80) {
        insights.push({
          category: "format",
          severity: "warning",
          message: `${Math.round(topPct)}% of workouts are ${topFormat[0].replace(/_/g, " ")}`,
          recommendation: "Mix in different formats to develop well-rounded fitness.",
        });
      }
    }

    // Check if strength is missing
    const hasStrength = counts.has("strength");
    if (!hasStrength && totalWorkouts >= 5) {
      insights.push({
        category: "format",
        severity: "info",
        message: "No dedicated strength sessions in this period",
        recommendation: "Consider adding strength work (back squat, deadlift, press) for long-term gains.",
      });
    }

    return insights;
  }

  private detectFrequencyPatterns(
    results: WorkoutResult[],
    periodDays: number
  ): BiasInsight[] {
    const insights: BiasInsight[] = [];

    const avgPerWeek = (results.length / periodDays) * 7;

    if (avgPerWeek < 2 && periodDays >= 14) {
      insights.push({
        category: "frequency",
        severity: "warning",
        message: `Averaging ${avgPerWeek.toFixed(1)} workouts/week over ${periodDays} days`,
        recommendation: "Aim for 3-5 sessions per week for consistent progress.",
      });
    } else if (avgPerWeek > 7) {
      insights.push({
        category: "frequency",
        severity: "alert",
        message: `Averaging ${avgPerWeek.toFixed(1)} workouts/week — that's more than once per day`,
        recommendation: "Ensure adequate recovery. Rest days are when you get stronger.",
      });
    }

    // Check for long gaps
    if (results.length >= 2) {
      const dates = results
        .map((r) => new Date(r.performedAt).getTime())
        .sort((a, b) => a - b);

      let maxGapDays = 0;
      for (let i = 1; i < dates.length; i++) {
        const gapDays = (dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24);
        maxGapDays = Math.max(maxGapDays, gapDays);
      }

      if (maxGapDays > 7) {
        insights.push({
          category: "frequency",
          severity: "info",
          message: `Longest gap between workouts: ${Math.round(maxGapDays)} days`,
          recommendation: "Try to maintain consistency. Even light sessions help maintain fitness.",
        });
      }
    }

    return insights;
  }
}

function sumValues(map: Map<string, number>): number {
  let sum = 0;
  for (const v of map.values()) sum += v;
  return sum;
}
