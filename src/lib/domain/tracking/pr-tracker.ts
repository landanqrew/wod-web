import type {
  WorkoutResult,
  PersonalRecord,
  PRCategory,
  PRUnit,
} from "../models/workout-result";
import { ScoreType } from "../models/workout";

/**
 * Detects new personal records from a workout result.
 *
 * Persistence is the caller's job: construct with the athlete's existing PRs,
 * call `detectPRs`, then write the returned records.
 */
export class PRTracker {
  constructor(private existingPRs: PersonalRecord[]) {}

  /**
   * Analyze a workout result for new PRs.
   * Returns the list of newly set PRs (not yet persisted).
   */
  detectPRs(result: WorkoutResult): PersonalRecord[] {
    return [
      ...this.checkWorkoutPRs(result),
      ...this.checkMovementPRs(result),
    ];
  }

  /** Best (highest) existing PR for a reference + category. */
  private getCurrentPR(
    athleteId: string,
    referenceId: string,
    category: PRCategory
  ): PersonalRecord | undefined {
    return this.forReference(athleteId, referenceId, category).sort(
      (a, b) => b.value - a.value
    )[0];
  }

  /** Best (lowest) existing time PR for a reference + category. */
  private getCurrentTimePR(
    athleteId: string,
    referenceId: string,
    category: PRCategory
  ): PersonalRecord | undefined {
    return this.forReference(athleteId, referenceId, category).sort(
      (a, b) => a.value - b.value
    )[0];
  }

  private forReference(
    athleteId: string,
    referenceId: string,
    category: PRCategory
  ): PersonalRecord[] {
    return this.existingPRs.filter(
      (pr) =>
        pr.athleteId === athleteId &&
        pr.referenceId === referenceId &&
        pr.category === category
    );
  }

  private checkWorkoutPRs(result: WorkoutResult): PersonalRecord[] {
    const prs: PersonalRecord[] = [];

    switch (result.scoreType) {
      case ScoreType.Time: {
        if (result.timeSeconds !== undefined) {
          const existing = this.getCurrentTimePR(
            result.athleteId,
            result.workoutId,
            "fastest_time"
          );
          if (!existing || result.timeSeconds < existing.value) {
            prs.push(
              this.makePR(result, "workout", result.workoutId, "fastest_time",
                result.timeSeconds, "seconds", existing?.value)
            );
          }
        }
        break;
      }
      case ScoreType.RoundsAndReps: {
        if (result.roundsCompleted !== undefined) {
          // Encode as rounds * 1000 + partialReps for simple comparison
          const score =
            result.roundsCompleted * 1000 + (result.partialReps ?? 0);
          const existing = this.getCurrentPR(
            result.athleteId,
            result.workoutId,
            "most_rounds"
          );
          if (!existing || score > existing.value) {
            prs.push(
              this.makePR(result, "workout", result.workoutId, "most_rounds",
                score, "rounds_reps", existing?.value)
            );
          }
        }
        break;
      }
      case ScoreType.Load: {
        if (result.peakLoad !== undefined) {
          const existing = this.getCurrentPR(
            result.athleteId,
            result.workoutId,
            "heaviest_load"
          );
          if (!existing || result.peakLoad > existing.value) {
            prs.push(
              this.makePR(result, "workout", result.workoutId, "heaviest_load",
                result.peakLoad, "lbs", existing?.value)
            );
          }
        }
        break;
      }
      case ScoreType.Reps: {
        if (result.totalReps !== undefined) {
          const existing = this.getCurrentPR(
            result.athleteId,
            result.workoutId,
            "max_reps"
          );
          if (!existing || result.totalReps > existing.value) {
            prs.push(
              this.makePR(result, "workout", result.workoutId, "max_reps",
                result.totalReps, "reps", existing?.value)
            );
          }
        }
        break;
      }
      case ScoreType.Calories: {
        if (result.totalCalories !== undefined) {
          const existing = this.getCurrentPR(
            result.athleteId,
            result.workoutId,
            "max_reps"
          );
          if (!existing || result.totalCalories > existing.value) {
            prs.push(
              this.makePR(result, "workout", result.workoutId, "max_reps",
                result.totalCalories, "calories", existing?.value)
            );
          }
        }
        break;
      }
      case ScoreType.Distance: {
        if (result.totalDistance !== undefined) {
          const existing = this.getCurrentPR(
            result.athleteId,
            result.workoutId,
            "max_reps"
          );
          if (!existing || result.totalDistance > existing.value) {
            prs.push(
              this.makePR(result, "workout", result.workoutId, "max_reps",
                result.totalDistance, "meters", existing?.value)
            );
          }
        }
        break;
      }
    }

    return prs;
  }

  private checkMovementPRs(result: WorkoutResult): PersonalRecord[] {
    const prs: PersonalRecord[] = [];

    for (const mr of result.movementResults) {
      if (mr.load !== undefined && mr.load > 0) {
        const existing = this.getCurrentPR(
          result.athleteId,
          mr.movementId,
          "heaviest_load"
        );
        if (!existing || mr.load > existing.value) {
          prs.push(
            this.makePR(result, "movement", mr.movementId, "heaviest_load",
              mr.load, "lbs", existing?.value)
          );
        }
      }
    }

    return prs;
  }

  private makePR(
    result: WorkoutResult,
    refType: "movement" | "workout",
    refId: string,
    category: PRCategory,
    value: number,
    unit: PRUnit,
    previousValue?: number
  ): PersonalRecord {
    return {
      id: `pr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      athleteId: result.athleteId,
      referenceId: refId,
      referenceType: refType,
      category,
      value,
      unit,
      achievedAt: result.performedAt,
      workoutResultId: result.id,
      previousValue,
    };
  }
}
