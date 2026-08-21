import "server-only";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "../db";
import { rowToResult, rowToWorkout } from "../db/mappers";
import {
  classSessions,
  gymClasses,
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
    const lastRunAtExpression = sql<Date | null>`max(${classSessions.startsAt}) filter (
      where ${gymClasses.gymId} = ${gymId}
        and ${classSessions.startsAt} <= ${now}
        and ${classSessions.cancelledAt} is null
    )`.mapWith(classSessions.startsAt);
    const rows = await tx
      .select({
        workout: workouts,
        lastRunAt: lastRunAtExpression,
        programmedRunCount: sql<number>`count(${classSessions.id}) filter (
          where ${gymClasses.gymId} = ${gymId}
            and ${classSessions.startsAt} <= ${now}
            and ${classSessions.cancelledAt} is null
        )`.mapWith(Number),
      })
      .from(workouts)
      .leftJoin(
        programmedWorkouts,
        eq(programmedWorkouts.sourceWorkoutId, workouts.id),
      )
      .leftJoin(classSessions, eq(classSessions.id, programmedWorkouts.classSessionId))
      .leftJoin(gymClasses, eq(gymClasses.id, classSessions.classId))
      .where(
        or(
          eq(workouts.gymId, gymId),
          and(isNull(workouts.gymId), eq(workouts.isBenchmark, true)),
        ),
      )
      .groupBy(workouts.id)
      .orderBy(sql`${lastRunAtExpression} desc nulls last`, workouts.name);
    const resultRows =
      rows.length === 0
        ? []
        : await tx
            .select({
              result: workoutResults,
              sourceWorkoutId: workoutResults.sourceWorkoutId,
            })
            .from(workoutResults)
            .innerJoin(
              classSessions,
              eq(classSessions.id, workoutResults.classSessionId),
            )
            .innerJoin(
              gymClasses,
              and(
                eq(gymClasses.id, classSessions.classId),
                eq(gymClasses.gymId, gymId),
              ),
            )
            .where(
              inArray(
                workoutResults.sourceWorkoutId,
                rows.map(({ workout }) => workout.id),
              ),
            )
            .orderBy(desc(workoutResults.performedAt));
    return rows.map((row) => ({
      sourceKind: row.workout.gymId === null ? "global" as const : "gym" as const,
      workout: hydrateWorkout(rowToWorkout(row.workout)),
      lastRunAt: row.lastRunAt?.toISOString() ?? null,
      programmedRunCount: row.programmedRunCount,
      results: resultRows
        .filter(({ sourceWorkoutId }) => sourceWorkoutId === row.workout.id)
        .map(({ result }) => rowToResult(result)),
    }));
  });
}
