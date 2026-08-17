import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { assignedWorkouts, reservations } from "../db/schema";
import type { AssignedWorkout } from "../domain/models/assigned-workout";
import { hydrateWorkout } from "./training";

export async function getAssignedWorkoutForAthlete(
  classSessionId: string,
  athleteId: string,
): Promise<AssignedWorkout | null> {
  const [reservation] = await db
    .select({ id: reservations.id })
    .from(reservations)
    .where(
      and(
        eq(reservations.classSessionId, classSessionId),
        eq(reservations.athleteId, athleteId),
      ),
    )
    .limit(1);
  if (!reservation) throw new Error("Class Session not found");

  const [row] = await db
    .select()
    .from(assignedWorkouts)
    .where(eq(assignedWorkouts.reservationId, reservation.id))
    .limit(1);
  return row ? { ...row, workout: hydrateWorkout(row.workout) } : null;
}
