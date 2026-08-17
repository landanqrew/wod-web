import { and, eq, gte } from "drizzle-orm";
import { db } from "../db";
import { classSessions, gymClasses, memberships } from "../db/schema";
import { MembershipRole } from "../domain/models/gym";
import {
  addDaysToLocalDate,
  expandClassSchedule,
  localDateInTimeZone,
} from "../domain/scheduling/expand-class-schedule";
import { newId } from "../ids";
import { gymClassInputSchema } from "../validation";

export interface ClassExpansionRange {
  startDate: string;
  endDate: string;
}

function defaultExpansionRange(timeZone: string): ClassExpansionRange {
  const startDate = localDateInTimeZone(new Date(), timeZone);
  return { startDate, endDate: addDaysToLocalDate(startDate, 90) };
}

async function requireOwnerAndEligibleCoach(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  gymId: string,
  ownerAthleteId: string,
  coachAthleteId: string,
) {
  const rows = await tx
    .select({ athleteId: memberships.athleteId, role: memberships.role })
    .from(memberships)
    .where(
      and(
        eq(memberships.gymId, gymId),
        eq(memberships.athleteId, ownerAthleteId),
      ),
    )
    .limit(1);
  if (rows[0]?.role !== MembershipRole.Owner) throw new Error("Gym not found");

  const [coach] = await tx
    .select({ role: memberships.role })
    .from(memberships)
    .where(
      and(
        eq(memberships.gymId, gymId),
        eq(memberships.athleteId, coachAthleteId),
      ),
    )
    .limit(1);
  if (
    coach?.role !== MembershipRole.Owner &&
    coach?.role !== MembershipRole.Coach
  ) {
    throw new Error("Coach must hold an owner or coaching Membership");
  }
}

async function insertExpandedSessions(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  classId: string,
  weeklyTimes: { dayOfWeek: number; localTime: string }[],
  timeZone: string,
  range: ClassExpansionRange,
) {
  const expanded = expandClassSchedule(
    weeklyTimes,
    timeZone,
    range.startDate,
    range.endDate,
  );
  if (expanded.length === 0) return;
  await tx.insert(classSessions).values(
    expanded.map(({ localDate, startsAt }) => ({
      id: newId("class_session"),
      classId,
      localDate,
      startsAt,
    })),
  );
}

export async function createClassForOwner(
  gymId: string,
  ownerAthleteId: string,
  raw: unknown,
  range?: ClassExpansionRange,
) {
  const input = gymClassInputSchema.parse(raw);
  const classId = newId("class");
  const expansionRange = range ?? defaultExpansionRange(input.timeZone);

  await db.transaction(async (tx) => {
    await requireOwnerAndEligibleCoach(
      tx,
      gymId,
      ownerAthleteId,
      input.coachAthleteId,
    );
    await tx.insert(gymClasses).values({
      id: classId,
      gymId,
      name: input.name,
      coachAthleteId: input.coachAthleteId,
      weeklyTimes: input.weeklyTimes,
      timeZone: input.timeZone,
      capacity: input.capacity,
    });
    await insertExpandedSessions(
      tx,
      classId,
      input.weeklyTimes,
      input.timeZone,
      expansionRange,
    );
  });

  return classId;
}

export async function updateClassForOwner(
  classId: string,
  ownerAthleteId: string,
  raw: unknown,
  effectiveFrom?: string,
  expandThrough?: string,
) {
  const input = gymClassInputSchema.parse(raw);
  const range = defaultExpansionRange(input.timeZone);
  const scheduleStartsOn = effectiveFrom ?? range.startDate;
  const scheduleEndsOn = expandThrough ?? range.endDate;

  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ gymId: gymClasses.gymId })
      .from(gymClasses)
      .where(eq(gymClasses.id, classId))
      .limit(1);
    if (!existing) throw new Error("Class not found");
    await requireOwnerAndEligibleCoach(
      tx,
      existing.gymId,
      ownerAthleteId,
      input.coachAthleteId,
    );

    await tx
      .update(gymClasses)
      .set({
        name: input.name,
        coachAthleteId: input.coachAthleteId,
        weeklyTimes: input.weeklyTimes,
        timeZone: input.timeZone,
        capacity: input.capacity,
        updatedAt: new Date(),
      })
      .where(eq(gymClasses.id, classId));
    await tx
      .delete(classSessions)
      .where(
        and(
          eq(classSessions.classId, classId),
          gte(classSessions.localDate, scheduleStartsOn),
        ),
      );
    await insertExpandedSessions(tx, classId, input.weeklyTimes, input.timeZone, {
      startDate: scheduleStartsOn,
      endDate: scheduleEndsOn,
    });
  });
}

export async function cancelClassSessionForOwner(
  classSessionId: string,
  ownerAthleteId: string,
) {
  await db.transaction(async (tx) => {
    const [session] = await tx
      .select({ gymId: gymClasses.gymId })
      .from(classSessions)
      .innerJoin(gymClasses, eq(gymClasses.id, classSessions.classId))
      .where(eq(classSessions.id, classSessionId))
      .limit(1);
    if (!session) throw new Error("Class Session not found");

    const [owner] = await tx
      .select({ role: memberships.role })
      .from(memberships)
      .where(
        and(
          eq(memberships.gymId, session.gymId),
          eq(memberships.athleteId, ownerAthleteId),
        ),
      )
      .limit(1);
    if (owner?.role !== MembershipRole.Owner) {
      throw new Error("Class Session not found");
    }

    await tx
      .update(classSessions)
      .set({ cancelledAt: new Date() })
      .where(eq(classSessions.id, classSessionId));
  });
}
