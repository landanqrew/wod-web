import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  assignedWorkouts,
  classSessions,
  personalRecords,
  programmedWorkouts,
  reservations,
  workoutResults,
  workouts,
} from "@/lib/db/schema";
import { prToRow, resultToRow, rowToPR, workoutToRow } from "@/lib/db/mappers";
import { getPRs } from "@/lib/data/training";
import { newId } from "@/lib/ids";
import { assignedWorkoutResultSchema, logResultSchema } from "@/lib/validation";
import { PRTracker } from "@/lib/domain/tracking/pr-tracker";
import type { Workout } from "@/lib/domain/models/workout";
import type { PersonalRecord, WorkoutResult } from "@/lib/domain/models/workout-result";

/** Persist a workout so results can reference it. Safe to call repeatedly. */
export async function upsertWorkout(workout: Workout, athleteId: string | null): Promise<string> {
  await db.insert(workouts).values(workoutToRow(workout, athleteId)).onConflictDoNothing({ target: workouts.id });
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

/** Log exactly the Assigned Workout owned by this athlete's Class Reservation. */
export async function logAssignedWorkoutResultForAthlete(
  classSessionId: string,
  athleteId: string,
  raw: unknown,
  now = new Date(),
) {
  const input = assignedWorkoutResultSchema.parse(raw);
  return db.transaction(async (tx) => {
    const [session] = await tx
      .select({
        id: classSessions.id,
        startsAt: classSessions.startsAt,
        cancelledAt: classSessions.cancelledAt,
      })
      .from(classSessions)
      .where(eq(classSessions.id, classSessionId))
      .limit(1)
      .for("update");
    if (!session) throw new Error("Class Session not found");
    if (session.cancelledAt) throw new Error("A canceled Class Session cannot be logged");
    const [context] = await tx
      .select({
        reservationId: reservations.id,
        assignedWorkoutId: assignedWorkouts.id,
        assignedWorkout: assignedWorkouts.workout,
        sourceWorkoutId: programmedWorkouts.sourceWorkoutId,
      })
      .from(reservations)
      .innerJoin(assignedWorkouts, eq(assignedWorkouts.reservationId, reservations.id))
      .leftJoin(programmedWorkouts, eq(programmedWorkouts.classSessionId, reservations.classSessionId))
      .where(and(eq(reservations.classSessionId, classSessionId), eq(reservations.athleteId, athleteId)))
      .limit(1)
      .for("update", { of: [reservations, assignedWorkouts] });
    if (!context) throw new Error("Assigned Workout not found");
    if (new Date(input.performedAt) < session.startsAt) {
      throw new Error("A Class result cannot be logged before the Session starts");
    }
    if (new Date(input.performedAt) > now) {
      throw new Error("A Class result cannot be logged in the future");
    }
    if (input.scoreType !== context.assignedWorkout.scoreType) {
      throw new Error("Result score type does not match the Assigned Workout");
    }
    const assignedMovementIds = new Set(context.assignedWorkout.movements.map(({ movementId }) => movementId));
    if (input.movementResults.some(({ movementId }) => !assignedMovementIds.has(movementId))) {
      throw new Error("Result contains a Movement outside the Assigned Workout");
    }

    const result: WorkoutResult = {
      id: newId("res"),
      athleteId,
      workoutId: context.assignedWorkoutId,
      assignedWorkoutId: context.assignedWorkoutId,
      sourceWorkoutId: context.sourceWorkoutId ?? undefined,
      classSessionId,
      performedAt: new Date(input.performedAt).toISOString(),
      scoreType: context.assignedWorkout.scoreType,
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
    await tx.insert(workoutResults).values(resultToRow(result));
    const existingPRs = (await tx.select().from(personalRecords).where(eq(personalRecords.athleteId, athleteId))).map(
      rowToPR
    );
    const prs = new PRTracker(existingPRs).detectPRs(result);
    if (prs.length > 0) await tx.insert(personalRecords).values(prs.map(prToRow));
    return { result, prs };
  });
}
