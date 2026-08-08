"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { trainingSessions, workoutResults } from "@/lib/db/schema";
import { requireAthlete } from "@/lib/data/athlete";
import { hydrateWorkout } from "@/lib/data/training";
import { logResultForAthlete, upsertWorkout } from "@/lib/training/log";
import { newId } from "@/lib/ids";
import { generateOptionsSchema, saveSessionSchema, workoutSchema } from "@/lib/validation";
import { generateWorkout } from "@/lib/domain/generator/workout-generator";
import type { GenerateOptions } from "@/lib/domain/generator/workout-generator";
import { buildSession } from "@/lib/domain/generator/session-builder";
import { generateAllScalingTiers } from "@/lib/domain/scaling/scaling-tiers";
import type { ScaledWorkout } from "@/lib/domain/scaling/scaling-tiers";
import type { Workout, TrainingSession, SessionBlock } from "@/lib/domain/models/workout";
import type { PersonalRecord, WorkoutResult } from "@/lib/domain/models/workout-result";
import type { WarmUpDrill, CoolDownDrill } from "@/lib/domain/generator/warmup-engine";

/** Generate a workout under the athlete's equipment + impediment constraints. */
export async function generateWorkoutAction(raw: unknown): Promise<Workout> {
  const athlete = await requireAthlete();
  const options = generateOptionsSchema.parse(raw) as GenerateOptions;
  return hydrateWorkout(generateWorkout(athlete, options));
}

export async function scaleWorkoutAction(raw: unknown): Promise<ScaledWorkout[]> {
  const athlete = await requireAthlete();
  const workout = workoutSchema.parse(raw) as Workout;
  return generateAllScalingTiers(workout, athlete.equipment).map((tier) => ({
    ...tier,
    workout: hydrateWorkout(tier.workout),
  }));
}

export async function buildSessionAction(raw: unknown): Promise<{
  session: TrainingSession;
  warmUpDrills: WarmUpDrill[];
  coolDownDrills: CoolDownDrill[];
}> {
  const athlete = await requireAthlete();
  const workout = workoutSchema.parse(raw) as Workout;
  const result = buildSession(athlete, {
    workout,
    totalMinutes: athlete.preferredDuration ?? 60,
  });
  return {
    ...result,
    session: {
      ...result.session,
      blocks: result.session.blocks.map((b) => ({
        ...b,
        workout: b.workout ? hydrateWorkout(b.workout) : undefined,
      })),
    },
  };
}

export async function saveWorkoutAction(raw: unknown): Promise<{ id: string }> {
  const athlete = await requireAthlete();
  const workout = workoutSchema.parse(raw) as Workout;
  await upsertWorkout(workout, athlete.id);
  revalidatePath("/history");
  return { id: workout.id };
}

export async function saveSessionAction(raw: unknown): Promise<{ id: string }> {
  const athlete = await requireAthlete();
  const input = saveSessionSchema.parse(raw);

  // Persist any embedded workouts so blocks stay loggable later.
  for (const block of input.blocks) {
    if (block.workout) await upsertWorkout(block.workout as Workout, athlete.id);
  }

  const id = newId("ses");
  await db.insert(trainingSessions).values({
    id,
    athleteId: athlete.id,
    date: input.date,
    blocks: input.blocks as SessionBlock[],
    totalDurationMinutes: input.totalDurationMinutes,
    notes: input.notes ?? null,
  });

  revalidatePath("/history");
  return { id };
}

/**
 * Log a result, then run PR detection. New PRs are returned so the client can
 * celebrate them — the app's one loud moment.
 */
export async function logResultAction(raw: unknown): Promise<{
  result: WorkoutResult;
  prs: PersonalRecord[];
}> {
  const athlete = await requireAthlete();
  const logged = await logResultForAthlete(athlete.id, raw);
  revalidatePath("/", "layout");
  return logged;
}

export async function deleteResultAction(resultId: string) {
  const athlete = await requireAthlete();
  await db
    .delete(workoutResults)
    .where(and(eq(workoutResults.id, resultId), eq(workoutResults.athleteId, athlete.id)));
  revalidatePath("/", "layout");
}
