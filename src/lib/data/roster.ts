import "server-only";
import { and, asc, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { db } from "../db";
import {
  assignedWorkouts,
  athletes,
  classSessions,
  gymClasses,
  impediments,
  memberships,
  programmedWorkouts,
  reservations,
} from "../db/schema";
import { rowToImpediment } from "../db/mappers";
import { Sex } from "../domain/models/athlete";
import type { AssignedWorkout } from "../domain/models/assigned-workout";
import { GymPermission, membershipHasPermission, type MembershipRole } from "../domain/models/gym";
import type { ClassSessionRoster } from "../domain/models/roster";
import { diffAssignedWorkout, summariseScalingPatterns } from "../domain/personalisation";
import { hydrateWorkout } from "./training";

type RosterTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** @internal Exported so concurrency tests can hold a known database snapshot. */
export async function getClassSessionRosterInSnapshot(
  tx: RosterTransaction,
  classSessionId: string,
  requestingAthleteId: string,
): Promise<ClassSessionRoster> {
  // One snapshot keeps the Programmed Workout and every reconciled Assigned
  // Workout from opposite sides of a reprogram commit.
  const snapshotRows = await tx
    .select({
      gymId: gymClasses.gymId,
      localDate: classSessions.localDate,
      requestingRole: memberships.role,
      programmedWorkout: programmedWorkouts.workout,
      athleteId: athletes.id,
      athleteName: athletes.name,
      sex: athletes.sex,
      assigned: assignedWorkouts,
    })
    .from(classSessions)
    .innerJoin(gymClasses, eq(gymClasses.id, classSessions.classId))
    .innerJoin(
      memberships,
      and(eq(memberships.gymId, gymClasses.gymId), eq(memberships.athleteId, requestingAthleteId)),
    )
    .leftJoin(programmedWorkouts, eq(programmedWorkouts.classSessionId, classSessions.id))
    .leftJoin(reservations, eq(reservations.classSessionId, classSessions.id))
    .leftJoin(athletes, eq(athletes.id, reservations.athleteId))
    .leftJoin(assignedWorkouts, eq(assignedWorkouts.reservationId, reservations.id))
    .where(eq(classSessions.id, classSessionId))
    .orderBy(asc(athletes.name), asc(athletes.id));
  const session = snapshotRows[0];
  if (!session || !membershipHasPermission(session.requestingRole as MembershipRole, GymPermission.ViewRoster)) {
    throw new Error("Gym not found");
  }

  const programmedWorkout = session.programmedWorkout ? hydrateWorkout(session.programmedWorkout) : null;
  const reservationRows = snapshotRows.filter(
    (row): row is typeof row & { athleteId: string; athleteName: string } =>
      row.athleteId !== null && row.athleteName !== null,
  );
  const athleteIds = reservationRows.map(({ athleteId }) => athleteId);
  const impedimentRows =
    athleteIds.length === 0
      ? []
      : await tx
          .select()
          .from(impediments)
          .where(
            and(
              inArray(impediments.athleteId, athleteIds),
              lte(impediments.startDate, session.localDate),
              or(isNull(impediments.endDate), gte(impediments.endDate, session.localDate)),
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
        ? diffAssignedWorkout(programmedWorkout, assignedWorkout, row.sex as Sex)
        : [];
    return {
      athleteId: row.athleteId,
      athleteName: row.athleteName,
      assignedWorkout,
      diffs,
      activeImpediments: impedimentRows.filter(({ athleteId }) => athleteId === row.athleteId).map(rowToImpediment),
    };
  });

  return {
    classSessionId,
    programmedWorkout,
    athletes: rosterAthletes,
    scalingPatterns: summariseScalingPatterns(rosterAthletes),
  };
}

export async function getClassSessionRoster(
  classSessionId: string,
  requestingAthleteId: string,
): Promise<ClassSessionRoster> {
  return db.transaction((tx) => getClassSessionRosterInSnapshot(tx, classSessionId, requestingAthleteId), {
    isolationLevel: "repeatable read",
    accessMode: "read only",
  });
}
