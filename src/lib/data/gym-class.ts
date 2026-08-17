import "server-only";
import { and, asc, eq, gte, inArray, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../db";
import {
  athletes,
  classSessions,
  gymClasses,
  gyms,
  memberships,
} from "../db/schema";
import { GymPermission } from "../domain/models/gym";
import type {
  ClassSessionSummary,
  GymClass,
} from "../domain/models/gym-class";
import type { WeeklyClassTime } from "../domain/scheduling/expand-class-schedule";
import { requireGymPermission } from "./gym";

const sessionCoaches = alias(athletes, "session_coaches");

export async function getClassesForGym(
  gymId: string,
  athleteId: string,
): Promise<GymClass[]> {
  await requireGymPermission(gymId, athleteId, GymPermission.View);
  const rows = await db
    .select({ class: gymClasses, coachName: athletes.name })
    .from(gymClasses)
    .leftJoin(athletes, eq(athletes.id, gymClasses.coachAthleteId))
    .where(eq(gymClasses.gymId, gymId));

  return rows.map((row) => ({
    id: row.class.id,
    gymId: row.class.gymId,
    name: row.class.name,
    coachAthleteId: row.class.coachAthleteId,
    coachName: row.coachName,
    weeklyTimes: row.class.weeklyTimes as WeeklyClassTime[],
    timeZone: row.class.timeZone,
    capacity: row.class.capacity,
  }));
}

export async function getUpcomingClassSessionsForAthlete(
  athleteId: string,
  from: Date,
  gymId?: string,
): Promise<ClassSessionSummary[]> {
  const rows = await db
    .select({
      session: classSessions,
      class: gymClasses,
      gym: gyms,
      coachName: sessionCoaches.name,
    })
    .from(classSessions)
    .innerJoin(gymClasses, eq(gymClasses.id, classSessions.classId))
    .innerJoin(gyms, eq(gyms.id, gymClasses.gymId))
    .innerJoin(
      memberships,
      and(
        eq(memberships.gymId, gyms.id),
        eq(memberships.athleteId, athleteId),
      ),
    )
    .leftJoin(
      sessionCoaches,
      eq(sessionCoaches.id, classSessions.coachAthleteId),
    )
    .where(
      and(
        gte(classSessions.startsAt, from),
        isNull(classSessions.cancelledAt),
        gymId ? eq(gyms.id, gymId) : undefined,
      ),
    )
    .orderBy(asc(classSessions.startsAt));

  return rows.map((row) => ({
    id: row.session.id,
    classId: row.class.id,
    className: row.class.name,
    gymId: row.gym.id,
    gymName: row.gym.name,
    startsAt: row.session.startsAt,
    localDate: row.session.localDate,
    timeZone: row.session.timeZone,
    coachName: row.coachName,
    capacity: row.class.capacity,
    cancelled: false,
  }));
}

export async function getClassSessionsForGym(
  gymId: string,
  athleteId: string,
  classIds: string[],
): Promise<ClassSessionSummary[]> {
  await requireGymPermission(gymId, athleteId, GymPermission.View);
  if (classIds.length === 0) return [];

  const rows = await db
    .select({
      session: classSessions,
      class: gymClasses,
      gym: gyms,
      coachName: sessionCoaches.name,
    })
    .from(classSessions)
    .innerJoin(gymClasses, eq(gymClasses.id, classSessions.classId))
    .innerJoin(gyms, eq(gyms.id, gymClasses.gymId))
    .leftJoin(
      sessionCoaches,
      eq(sessionCoaches.id, classSessions.coachAthleteId),
    )
    .where(
      and(
        eq(gyms.id, gymId),
        inArray(classSessions.classId, classIds),
      ),
    )
    .orderBy(asc(classSessions.startsAt));

  return rows.map((row) => ({
    id: row.session.id,
    classId: row.class.id,
    className: row.class.name,
    gymId: row.gym.id,
    gymName: row.gym.name,
    startsAt: row.session.startsAt,
    localDate: row.session.localDate,
    timeZone: row.session.timeZone,
    coachName: row.coachName,
    capacity: row.class.capacity,
    cancelled: row.session.cancelledAt !== null,
  }));
}
