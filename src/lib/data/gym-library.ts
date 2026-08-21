import "server-only";
import { and, count, desc, eq, inArray, isNull, lte, max } from "drizzle-orm";
import { db } from "../db";
import { rowToResult, rowToWorkout } from "../db/mappers";
import {
  classSessions,
  gyms,
  memberships,
  programmedWorkouts,
  workoutResults,
  workouts,
} from "../db/schema";
import {
  GymPermission,
  membershipHasPermission,
  type MembershipRole,
} from "../domain/models/gym";
import type { GymLibraryWorkout } from "../domain/models/gym-library";
import { hydrateWorkout } from "./training";

export async function getGymLibrary(
  gymId: string,
  athleteId: string,
  now = new Date(),
): Promise<GymLibraryWorkout[]> {
  return db.transaction(async (tx) => {
    const [gym] = await tx
      .select({ id: gyms.id })
      .from(gyms)
      .where(eq(gyms.id, gymId))
      .limit(1)
      .for("key share");
    const [membership] = gym
      ? await tx
          .select({ role: memberships.role })
          .from(memberships)
          .where(
            and(
              eq(memberships.gymId, gymId),
              eq(memberships.athleteId, athleteId),
            ),
          )
          .limit(1)
          .for("key share")
      : [];
    if (
      !membership ||
      !membershipHasPermission(
        membership.role as MembershipRole,
        GymPermission.ViewRoster,
      )
    ) {
      throw new Error("Gym not found");
    }
    const rows = await tx
      .select({
        workout: workouts,
        lastRunAt: max(classSessions.startsAt),
        programmedRunCount: count(classSessions.id),
      })
      .from(workouts)
      .leftJoin(
        programmedWorkouts,
        eq(programmedWorkouts.sourceWorkoutId, workouts.id),
      )
      .leftJoin(
        classSessions,
        and(
          eq(classSessions.id, programmedWorkouts.classSessionId),
          lte(classSessions.startsAt, now),
          isNull(classSessions.cancelledAt),
        ),
      )
      .where(eq(workouts.gymId, gymId))
      .groupBy(workouts.id)
      .orderBy(desc(max(classSessions.startsAt)), workouts.name);
    const resultRows =
      rows.length === 0
        ? []
        : await tx
            .select()
            .from(workoutResults)
            .where(
              inArray(
                workoutResults.workoutId,
                rows.map(({ workout }) => workout.id),
              ),
            )
            .orderBy(desc(workoutResults.performedAt));
    return rows.map((row) => ({
      workout: hydrateWorkout(rowToWorkout(row.workout)),
      lastRunAt: row.lastRunAt?.toISOString() ?? null,
      programmedRunCount: row.programmedRunCount,
      results: resultRows
        .filter(({ workoutId }) => workoutId === row.workout.id)
        .map(rowToResult),
    }));
  });
}
