import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { personalRecords, workoutResults, workouts } from "@/lib/db/schema";
import { prToRow, resultToRow, workoutToRow } from "@/lib/db/mappers";
import { getPRs } from "@/lib/data/training";
import { newId } from "@/lib/ids";
import { logResultSchema } from "@/lib/validation";
import { PRTracker } from "@/lib/domain/tracking/pr-tracker";
import type { Workout } from "@/lib/domain/models/workout";
import type { PersonalRecord, WorkoutResult } from "@/lib/domain/models/workout-result";

/** Persist a workout so results can reference it. Safe to call repeatedly. */
export async function upsertWorkout(workout: Workout, athleteId: string | null): Promise<string> {
  await db
    .insert(workouts)
    .values(workoutToRow(workout, athleteId))
    .onConflictDoNothing({ target: workouts.id });
  return workout.id;
}

/**
 * Log a result and detect records — the app's core write path.
 * Auth lives in the server action; this half is independently testable.
 */
export async function logResultForAthlete(
  athleteId: string,
  raw: unknown
): Promise<{ result: WorkoutResult; prs: PersonalRecord[] }> {
  const input = logResultSchema.parse(raw);

  if (input.workout) await upsertWorkout(input.workout as Workout, athleteId);

  const [existing] = await db
    .select({ id: workouts.id })
    .from(workouts)
    .where(eq(workouts.id, input.workoutId))
    .limit(1);
  if (!existing) throw new Error("Unknown workout");

  const result: WorkoutResult = {
    id: newId("res"),
    athleteId,
    workoutId: input.workoutId,
    performedAt: new Date(input.performedAt).toISOString(),
    scoreType: input.scoreType as WorkoutResult["scoreType"],
    timeSeconds: input.timeSeconds,
    roundsCompleted: input.roundsCompleted,
    partialReps: input.partialReps,
    peakLoad: input.peakLoad,
    totalReps: input.totalReps,
    totalCalories: input.totalCalories,
    totalDistance: input.totalDistance,
    rpe: input.rpe,
    rx: input.rx,
    scalingTier: input.scalingTier,
    movementResults: input.movementResults,
    notes: input.notes,
  };

  await db.insert(workoutResults).values(resultToRow(result));

  const prs = new PRTracker(await getPRs(athleteId)).detectPRs(result);
  if (prs.length > 0) await db.insert(personalRecords).values(prs.map(prToRow));

  return { result, prs };
}
