import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, pool } from "../db";
import { athletes, gyms, users } from "../db/schema";
import {
  getClassSessionHeadcount,
  getClassSessionsForGym,
  getUpcomingClassSessionsForAthlete,
} from "../data/gym-class";
import { Equipment } from "../domain/models/equipment";
import { MembershipRole } from "../domain/models/gym";
import { newId } from "../ids";
import { createClassForOwner } from "./gym-class";
import {
  createGymForOwner,
  grantGymMembership,
  revokeGymMembership,
} from "./gym";
import {
  cancelReservationForAthlete,
  ClassSessionFullError,
  reserveClassSessionForAthlete,
} from "./reservation";

const ownerUserId = newId("test_user");
const ownerAthleteId = newId("test_ath");
const coachUserId = newId("test_user");
const coachAthleteId = newId("test_ath");
const memberUserId = newId("test_user");
const memberAthleteId = newId("test_ath");
let gymId: string | undefined;

beforeAll(async () => {
  await db.insert(users).values([
    { id: ownerUserId, name: "Owner", email: `${ownerUserId}@test.local` },
    { id: coachUserId, name: "Coach", email: `${coachUserId}@test.local` },
    { id: memberUserId, name: "Member", email: `${memberUserId}@test.local` },
  ]);
  await db.insert(athletes).values([
    {
      id: ownerAthleteId,
      userId: ownerUserId,
      name: "Owner",
      sex: "female",
      equipment: [Equipment.Barbell],
    },
    {
      id: coachAthleteId,
      userId: coachUserId,
      name: "Coach",
      sex: "male",
      equipment: [],
    },
    {
      id: memberAthleteId,
      userId: memberUserId,
      name: "Member",
      sex: "female",
      equipment: [],
    },
  ]);
});

afterAll(async () => {
  if (gymId) await db.delete(gyms).where(eq(gyms.id, gymId));
  await db.delete(users).where(eq(users.id, ownerUserId));
  await db.delete(users).where(eq(users.id, coachUserId));
  await db.delete(users).where(eq(users.id, memberUserId));
  await pool.end();
});

describe("Class Session Reservations", () => {
  it("books before programming, enforces capacity, and frees cancelled spots", async () => {
    gymId = await createGymForOwner(ownerAthleteId, {
      name: "Iron Ridge",
      floor: [],
    });
    await grantGymMembership(gymId, ownerAthleteId, {
      email: `${coachUserId}@test.local`,
      role: MembershipRole.Coach,
    });
    await grantGymMembership(gymId, ownerAthleteId, {
      email: `${memberUserId}@test.local`,
      role: MembershipRole.Member,
    });
    const classId = await createClassForOwner(
      gymId,
      ownerAthleteId,
      {
        name: "6am CrossFit",
        coachAthleteId,
        weeklyTimes: [{ dayOfWeek: 1, localTime: "06:00" }],
        timeZone: "America/Chicago",
        capacity: 1,
      },
      { startDate: "2027-03-01", endDate: "2027-03-01" },
    );
    const [session] = await getClassSessionsForGym(
      gymId,
      ownerAthleteId,
      [classId],
    );
    const beforeSession = new Date("2027-02-01T00:00:00Z");

    await expect(
      getClassSessionHeadcount(session.id, memberAthleteId),
    ).rejects.toThrow("Gym not found");
    await reserveClassSessionForAthlete(
      session.id,
      memberAthleteId,
      beforeSession,
    );
    expect(
      await getUpcomingClassSessionsForAthlete(memberAthleteId, beforeSession),
    ).toEqual([
      expect.objectContaining({
        id: session.id,
        gymName: "Iron Ridge",
        reserved: true,
        reservationCount: 1,
        workoutPosted: false,
      }),
    ]);
    await expect(
      getClassSessionHeadcount(session.id, coachAthleteId),
    ).resolves.toBe(1);
    await expect(
      reserveClassSessionForAthlete(session.id, ownerAthleteId, beforeSession),
    ).rejects.toBeInstanceOf(ClassSessionFullError);
    await expect(
      cancelReservationForAthlete(session.id, ownerAthleteId),
    ).rejects.toThrow("Reservation not found");

    await cancelReservationForAthlete(session.id, memberAthleteId);
    await expect(
      getClassSessionHeadcount(session.id, coachAthleteId),
    ).resolves.toBe(0);
    await revokeGymMembership(gymId, ownerAthleteId, memberAthleteId);
    await expect(
      reserveClassSessionForAthlete(session.id, memberAthleteId, beforeSession),
    ).rejects.toThrow("Class Session not found");

    await reserveClassSessionForAthlete(
      session.id,
      ownerAthleteId,
      beforeSession,
    );
    await expect(
      getClassSessionHeadcount(session.id, coachAthleteId),
    ).resolves.toBe(1);
    await cancelReservationForAthlete(session.id, ownerAthleteId);

    const concurrent = await Promise.allSettled([
      reserveClassSessionForAthlete(session.id, ownerAthleteId, beforeSession),
      reserveClassSessionForAthlete(session.id, coachAthleteId, beforeSession),
    ]);
    expect(concurrent.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(concurrent.filter(({ status }) => status === "rejected")).toHaveLength(1);
    await expect(
      getClassSessionHeadcount(session.id, coachAthleteId),
    ).resolves.toBe(1);
    await Promise.allSettled([
      cancelReservationForAthlete(session.id, ownerAthleteId),
      cancelReservationForAthlete(session.id, coachAthleteId),
    ]);
  });
});
