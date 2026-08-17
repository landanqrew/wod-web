import { and, eq, gte, notInArray } from "drizzle-orm";
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
  effectiveFrom: Date = new Date(),
  expandThrough?: string,
) {
  const input = gymClassInputSchema.parse(raw);
  const range = defaultExpansionRange(input.timeZone);
  const scheduleStartsOn = localDateInTimeZone(effectiveFrom, input.timeZone);
  const scheduleEndsOn = expandThrough ?? range.endDate;
  const expanded = expandClassSchedule(
    input.weeklyTimes,
    input.timeZone,
    scheduleStartsOn,
    scheduleEndsOn,
  ).filter(({ startsAt }) => startsAt >= effectiveFrom);

  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ gymId: gymClasses.gymId })
      .from(gymClasses)
      .where(eq(gymClasses.id, classId))
      .limit(1)
      .for("update");
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
    const obsolete = and(
      eq(classSessions.classId, classId),
      gte(classSessions.startsAt, effectiveFrom),
      expanded.length > 0
        ? notInArray(
            classSessions.startsAt,
            expanded.map(({ startsAt }) => startsAt),
          )
        : undefined,
    );
    await tx.delete(classSessions).where(obsolete);
    if (expanded.length > 0) {
      await tx
        .insert(classSessions)
        .values(
          expanded.map(({ localDate, startsAt }) => ({
            id: newId("class_session"),
            classId,
            localDate,
            startsAt,
          })),
        )
        .onConflictDoNothing();
    }
  });
}

export async function ensureUpcomingClassSessions(
  athleteId: string,
  now: Date = new Date(),
  horizonDays = 90,
) {
  await db.transaction(async (tx) => {
    const classes = await tx
      .select({ class: gymClasses })
      .from(gymClasses)
      .innerJoin(
        memberships,
        and(
          eq(memberships.gymId, gymClasses.gymId),
          eq(memberships.athleteId, athleteId),
        ),
      )
      .for("update", { of: gymClasses });

    for (const row of classes) {
      const startDate = localDateInTimeZone(now, row.class.timeZone);
      const expanded = expandClassSchedule(
        row.class.weeklyTimes,
        row.class.timeZone,
        startDate,
        addDaysToLocalDate(startDate, horizonDays),
      ).filter(({ startsAt }) => startsAt >= now);
      if (expanded.length === 0) continue;
      await tx
        .insert(classSessions)
        .values(
          expanded.map(({ localDate, startsAt }) => ({
            id: newId("class_session"),
            classId: row.class.id,
            localDate,
            startsAt,
          })),
        )
        .onConflictDoNothing();
    }
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
