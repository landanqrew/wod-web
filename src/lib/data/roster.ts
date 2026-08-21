import "server-only";
import { and, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { db } from "../db";
import {
  assignedWorkouts,
  athletes,
  classSessions,
  gymClasses,
  impediments,
  programmedWorkouts,
  reservations,
} from "../db/schema";
import { rowToImpediment } from "../db/mappers";
import { Sex } from "../domain/models/athlete";
import type { AssignedWorkout } from "../domain/models/assigned-workout";
import { GymPermission } from "../domain/models/gym";
import type { ClassSessionRoster } from "../domain/models/roster";
import {
  diffAssignedWorkout,
  summariseScalingPatterns,
} from "../domain/personalisation";
import { requireGymPermission } from "./gym";
import { hydrateWorkout } from "./training";

export async function getClassSessionRoster(
  classSessionId: string,
  requestingAthleteId: string,
): Promise<ClassSessionRoster> {
  const [session] = await db
    .select({
      gymId: gymClasses.gymId,
      localDate: classSessions.localDate,
    })
    .from(classSessions)
    .innerJoin(gymClasses, eq(gymClasses.id, classSessions.classId))
    .where(eq(classSessions.id, classSessionId))
    .limit(1);
  if (!session) throw new Error("Class Session not found");
  await requireGymPermission(
    session.gymId,
    requestingAthleteId,
    GymPermission.ViewRoster,
  );

  const [programmed] = await db
    .select({ workout: programmedWorkouts.workout })
    .from(programmedWorkouts)
    .where(eq(programmedWorkouts.classSessionId, classSessionId))
    .limit(1);
  const programmedWorkout = programmed
    ? hydrateWorkout(programmed.workout)
    : null;
  const reservationRows = await db
    .select({
      athleteId: athletes.id,
      athleteName: athletes.name,
      sex: athletes.sex,
      assigned: assignedWorkouts,
    })
    .from(reservations)
    .innerJoin(athletes, eq(athletes.id, reservations.athleteId))
    .leftJoin(
      assignedWorkouts,
      eq(assignedWorkouts.reservationId, reservations.id),
    )
    .where(eq(reservations.classSessionId, classSessionId));
  const athleteIds = reservationRows.map(({ athleteId }) => athleteId);
  const impedimentRows =
    athleteIds.length === 0
      ? []
      : await db
          .select()
          .from(impediments)
          .where(
            and(
              inArray(impediments.athleteId, athleteIds),
              lte(impediments.startDate, session.localDate),
              or(
                isNull(impediments.endDate),
                gte(impediments.endDate, session.localDate),
              ),
            ),
          );

  const rosterAthletes = reservationRows.map((row) => {
    const assignedWorkout: AssignedWorkout | null = row.assigned
      ? {
          ...row.assigned,
          workout: hydrateWorkout(row.assigned.workout),
        }
      : null;
    const diffs =
      programmedWorkout && assignedWorkout
        ? diffAssignedWorkout(
            programmedWorkout,
            assignedWorkout,
            row.sex as Sex,
          )
        : [];
    return {
      athleteId: row.athleteId,
      athleteName: row.athleteName,
      assignedWorkout,
      diffs,
      activeImpediments: impedimentRows
        .filter(({ athleteId }) => athleteId === row.athleteId)
        .map(rowToImpediment),
    };
  });

  return {
    classSessionId,
    programmedWorkout,
    athletes: rosterAthletes,
    scalingPatterns: summariseScalingPatterns(rosterAthletes),
  };
}
