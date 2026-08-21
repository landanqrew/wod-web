import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { workoutToRow } from "../db/mappers";
import { workouts } from "../db/schema";
import type { Workout } from "../domain/models/workout";
import { newId } from "../ids";
import { workoutSchema } from "../validation";
import { lockProgrammingGymInTransaction } from "./programmed-workout";

export async function saveGymLibraryWorkout(
  gymId: string,
  athleteId: string,
  rawWorkout: unknown,
): Promise<string> {
  const workout = workoutSchema.parse(rawWorkout) as Workout;
  return db.transaction(async (tx) => {
    await lockProgrammingGymInTransaction(tx, gymId, athleteId, "Gym not found");
    const id = newId("wod");
    await tx.insert(workouts).values(
      workoutToRow(
        { ...workout, id, isBenchmark: false },
        athleteId,
        undefined,
        gymId,
      ),
    );
    return id;
  });
}

export async function updateGymLibraryWorkout(
  gymId: string,
  athleteId: string,
  workoutId: string,
  rawWorkout: unknown,
): Promise<void> {
  const workout = workoutSchema.parse(rawWorkout) as Workout;
  await db.transaction(async (tx) => {
    await lockProgrammingGymInTransaction(tx, gymId, athleteId, "Workout not found");
    const { id: _id, createdAt: _createdAt, ...updatedWorkout } = workoutToRow(
      { ...workout, id: workoutId, isBenchmark: false },
      athleteId,
      undefined,
      gymId,
    );
    const [updated] = await tx
      .update(workouts)
      .set({
        ...updatedWorkout,
        updatedAt: new Date(),
      })
      .where(and(eq(workouts.id, workoutId), eq(workouts.gymId, gymId)))
      .returning({ id: workouts.id });
    if (!updated) throw new Error("Workout not found");
  });
}
