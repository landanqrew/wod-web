import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import {
  classSessions,
  gymClasses,
  memberships,
  programmedWorkouts,
  reservations,
} from "../db/schema";
import { membershipHasPermission, GymPermission, type MembershipRole } from "../domain/models/gym";
import type { ProgrammedWorkout } from "../domain/models/programmed-workout";
import { hydrateWorkout } from "./training";

export async function getProgrammedWorkoutForSession(
  classSessionId: string,
  athleteId: string,
): Promise<ProgrammedWorkout | null> {
  const [session] = await db
    .select({ gymId: gymClasses.gymId })
    .from(classSessions)
    .innerJoin(gymClasses, eq(gymClasses.id, classSessions.classId))
    .where(eq(classSessions.id, classSessionId))
    .limit(1);
  if (!session) throw new Error("Class Session not found");

  const [membership] = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(
      and(
        eq(memberships.gymId, session.gymId),
        eq(memberships.athleteId, athleteId),
      ),
    )
    .limit(1);
  const canProgram =
    membership &&
    membershipHasPermission(
      membership.role as MembershipRole,
      GymPermission.Program,
    );
  if (!canProgram) {
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
  }

  const [row] = await db
    .select()
    .from(programmedWorkouts)
    .where(eq(programmedWorkouts.classSessionId, classSessionId))
    .limit(1);
  return row ? { ...row, workout: hydrateWorkout(row.workout) } : null;
}
