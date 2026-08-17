import { and, count, eq, gt } from "drizzle-orm";
import { db } from "../db";
import {
  classSessions,
  gymClasses,
  memberships,
  reservations,
} from "../db/schema";
import { newId } from "../ids";

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
  return db.transaction(async (tx) => {
    const [session] = await tx
      .select({
        gymId: gymClasses.gymId,
        capacity: gymClasses.capacity,
        cancelledAt: classSessions.cancelledAt,
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

    const [membership] = await tx
      .select({ athleteId: memberships.athleteId })
      .from(memberships)
      .where(
        and(
          eq(memberships.gymId, session.gymId),
          eq(memberships.athleteId, athleteId),
        ),
      )
      .limit(1);
    if (!membership) throw new Error("Class Session not found");

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
    if (existing) return existing.id;

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
    return reservationId;
  });
}

export async function cancelReservationForAthlete(
  classSessionId: string,
  athleteId: string,
) {
  const [cancelled] = await db
    .delete(reservations)
    .where(
      and(
        eq(reservations.classSessionId, classSessionId),
        eq(reservations.athleteId, athleteId),
      ),
    )
    .returning({ id: reservations.id });
  if (!cancelled) throw new Error("Reservation not found");
}
