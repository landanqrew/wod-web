import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  personalRecords,
  trainingSessions,
  workoutResults,
  workouts,
} from "@/lib/db/schema";
import { rowToPR, rowToResult, rowToSession, rowToWorkout } from "@/lib/db/mappers";
import type { PersonalRecord, WorkoutResult } from "@/lib/domain/models/workout-result";
import type { TrainingSession, Workout } from "@/lib/domain/models/workout";
import { getMovement } from "@/lib/domain/movements/library";

/** Attach movement metadata to prescriptions for display. */
export function hydrateWorkout(workout: Workout): Workout {
  return {
    ...workout,
    movements: workout.movements.map((p) => ({ ...p, movement: getMovement(p.movementId) })),
  };
}

export async function getResults(athleteId: string): Promise<WorkoutResult[]> {
  const rows = await db
    .select()
    .from(workoutResults)
    .where(eq(workoutResults.athleteId, athleteId))
    .orderBy(desc(workoutResults.performedAt));
  return rows.map(rowToResult);
}

export async function getResult(
  athleteId: string,
  resultId: string
): Promise<WorkoutResult | null> {
  const [row] = await db
    .select()
    .from(workoutResults)
    .where(and(eq(workoutResults.athleteId, athleteId), eq(workoutResults.id, resultId)))
    .limit(1);
  return row ? rowToResult(row) : null;
}

export async function getWorkout(workoutId: string): Promise<Workout | null> {
  const [row] = await db.select().from(workouts).where(eq(workouts.id, workoutId)).limit(1);
  return row ? hydrateWorkout(rowToWorkout(row)) : null;
}

export async function getWorkoutsByIds(ids: string[]): Promise<Map<string, Workout>> {
  if (ids.length === 0) return new Map();
  const rows = await db.select().from(workouts).where(inArray(workouts.id, ids));
  return new Map(rows.map((r) => [r.id, hydrateWorkout(rowToWorkout(r))]));
}

/** Every workout referenced by an athlete's results — what the analyzers need. */
export async function getWorkoutsForResults(results: WorkoutResult[]): Promise<Workout[]> {
  const ids = [...new Set(results.map((r) => r.workoutId))];
  return [...(await getWorkoutsByIds(ids)).values()];
}

export async function getBenchmarkWorkouts(): Promise<Workout[]> {
  const rows = await db
    .select()
    .from(workouts)
    .where(eq(workouts.isBenchmark, true))
    .orderBy(workouts.name);
  return rows.map((r) => hydrateWorkout(rowToWorkout(r)));
}

export async function getPRs(athleteId: string): Promise<PersonalRecord[]> {
  const rows = await db
    .select()
    .from(personalRecords)
    .where(eq(personalRecords.athleteId, athleteId))
    .orderBy(desc(personalRecords.achievedAt));
  return rows.map(rowToPR);
}

export async function getSessions(athleteId: string): Promise<TrainingSession[]> {
  const rows = await db
    .select()
    .from(trainingSessions)
    .where(eq(trainingSessions.athleteId, athleteId))
    .orderBy(desc(trainingSessions.date));
  return rows.map(rowToSession);
}

export async function getSession(
  athleteId: string,
  sessionId: string
): Promise<TrainingSession | null> {
  const [row] = await db
    .select()
    .from(trainingSessions)
    .where(and(eq(trainingSessions.athleteId, athleteId), eq(trainingSessions.id, sessionId)))
    .limit(1);
  return row ? rowToSession(row) : null;
}
