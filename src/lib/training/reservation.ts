import { and, count, eq, gt, notExists } from "drizzle-orm";
import { db } from "../db";
import {
  classSessions,
  assignedWorkouts,
  gymClasses,
  memberships,
  programmedWorkouts,
  reservations,
  workoutResults,
  workouts,
} from "../db/schema";
import { newId } from "../ids";
import { materialiseAssignedWorkout } from "./assigned-workout";

type ReservationTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];

export class ClassSessionFullError extends Error {
  constructor() {
    super("Class Session is at capacity");
    this.name = "ClassSessionFullError";
  }
}

export async function reserveClassSessionForAthlete(
  classSessionId: string,
  athleteId: string,
  now: Date = new Date(),
) {
  return db.transaction((tx) =>
    reserveClassSessionForAthleteInTransaction(
      tx,
      classSessionId,
      athleteId,
      now,
    ),
  );
}

export async function reserveClassSessionForAthleteInTransaction(
  tx: ReservationTransaction,
  classSessionId: string,
  athleteId: string,
  now: Date = new Date(),
) {
  const [candidate] = await tx
    .select({
      gymId: gymClasses.gymId,
    })
    .from(classSessions)
    .innerJoin(gymClasses, eq(gymClasses.id, classSessions.classId))
    .where(eq(classSessions.id, classSessionId))
    .limit(1);
  if (!candidate) throw new Error("Class Session not found");

  const [membership] = await tx
    .select({ athleteId: memberships.athleteId })
    .from(memberships)
    .where(
      and(
        eq(memberships.gymId, candidate.gymId),
        eq(memberships.athleteId, athleteId),
      ),
    )
    .limit(1)
    .for("update");
  if (!membership) throw new Error("Class Session not found");

  const [session] = await tx
      .select({
        capacity: gymClasses.capacity,
        cancelledAt: classSessions.cancelledAt,
        localDate: classSessions.localDate,
    })
    .from(classSessions)
    .innerJoin(gymClasses, eq(gymClasses.id, classSessions.classId))
    .where(
      and(
        eq(classSessions.id, classSessionId),
        gt(classSessions.startsAt, now),
      ),
    )
    .limit(1)
    .for("update", { of: classSessions });
  if (!session || session.cancelledAt) {
    throw new Error("Class Session not found");
  }

  const [existing] = await tx
    .select({ id: reservations.id })
    .from(reservations)
    .where(
      and(
        eq(reservations.classSessionId, classSessionId),
        eq(reservations.athleteId, athleteId),
      ),
      )
      .limit(1);
  if (existing) {
    const [programmed] = await tx
      .select({ workout: programmedWorkouts.workout })
      .from(programmedWorkouts)
      .where(eq(programmedWorkouts.classSessionId, classSessionId))
      .limit(1);
    if (programmed) {
      await materialiseAssignedWorkout(tx, {
        reservationId: existing.id,
        athleteId,
        gymId: candidate.gymId,
        localDate: session.localDate,
        programmedWorkout: programmed.workout,
      });
    }
    return existing.id;
  }

  const [headcount] = await tx
    .select({ value: count() })
    .from(reservations)
    .where(eq(reservations.classSessionId, classSessionId));
  if (headcount.value >= session.capacity) throw new ClassSessionFullError();

  const reservationId = newId("reservation");
  await tx.insert(reservations).values({
    id: reservationId,
    classSessionId,
    athleteId,
  });
  const [programmed] = await tx
    .select({ workout: programmedWorkouts.workout })
    .from(programmedWorkouts)
    .where(eq(programmedWorkouts.classSessionId, classSessionId))
    .limit(1);
  if (programmed) {
    await materialiseAssignedWorkout(tx, {
      reservationId,
      athleteId,
      gymId: candidate.gymId,
      localDate: session.localDate,
      programmedWorkout: programmed.workout,
    });
  }
  return reservationId;
}

export async function cancelReservationForAthlete(
  classSessionId: string,
  athleteId: string,
  discardAssignedWorkout = false,
) {
  return db.transaction(async (tx) => {
    const [reservation] = await tx
      .select({ id: reservations.id })
      .from(reservations)
      .where(
        and(
          eq(reservations.classSessionId, classSessionId),
          eq(reservations.athleteId, athleteId),
        ),
      )
      .limit(1)
      .for("update");
    if (!reservation) throw new Error("Reservation not found");
    const [assigned] = await tx
      .select({ id: assignedWorkouts.id })
      .from(assignedWorkouts)
      .where(eq(assignedWorkouts.reservationId, reservation.id))
      .limit(1);
    if (assigned && !discardAssignedWorkout) {
      return {
        cancelled: false as const,
        requiresAssignedWorkoutConfirmation: true as const,
      };
    }
    await tx.delete(reservations).where(eq(reservations.id, reservation.id));
    if (assigned) {
      await tx
        .delete(workouts)
        .where(
          and(
            eq(workouts.id, assigned.id),
            notExists(
              tx
                .select({ id: workoutResults.id })
                .from(workoutResults)
                .where(eq(workoutResults.workoutId, assigned.id)),
            ),
          ),
        );
    }
    return {
      cancelled: true as const,
      discardedAssignedWorkout: Boolean(assigned),
    };
  });
}
