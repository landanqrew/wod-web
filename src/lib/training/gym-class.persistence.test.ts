import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, pool } from "../db";
import { athletes, gyms, users } from "../db/schema";
import { getClassesForGym, getClassSessionsForGym, getUpcomingClassSessionsForAthlete } from "../data/gym-class";
import { Equipment } from "../domain/models/equipment";
import { MembershipRole } from "../domain/models/gym";
import { newId } from "../ids";
import {
  cancelClassSessionForOwner,
  createClassForOwner,
  ensureUpcomingClassSessions,
  updateClassForOwner,
} from "./gym-class";
import {
  createGymForOwner,
  grantGymMembership,
  revokeGymMembership,
} from "./gym";

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

describe("Classes and dated Class Sessions", () => {
  it("expands, cancels, and changes a schedule without rewriting its past", async () => {
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

    await expect(
      createClassForOwner(
        gymId,
        ownerAthleteId,
        {
          name: "Invalid coach",
          coachAthleteId: memberAthleteId,
          weeklyTimes: [{ dayOfWeek: 0, localTime: "06:00" }],
          timeZone: "America/Chicago",
          capacity: 25,
        },
        { startDate: "2026-03-01", endDate: "2026-03-15" },
      ),
    ).rejects.toThrow("coaching Membership");

    const classId = await createClassForOwner(
      gymId,
      ownerAthleteId,
      {
        name: "6am CrossFit",
        coachAthleteId,
        weeklyTimes: [{ dayOfWeek: 0, localTime: "06:00" }],
        timeZone: "America/Chicago",
        capacity: 25,
      },
      { startDate: "2026-03-01", endDate: "2026-03-15" },
    );

    expect(await getClassesForGym(gymId, memberAthleteId)).toEqual([
      expect.objectContaining({
        id: classId,
        coachAthleteId,
        weeklyTimes: [{ dayOfWeek: 0, localTime: "06:00" }],
      }),
    ]);
    const original = await getClassSessionsForGym(
      gymId,
      ownerAthleteId,
      [classId],
    );
    expect(original.map(({ localDate }) => localDate)).toEqual([
      "2026-03-01",
      "2026-03-08",
      "2026-03-15",
    ]);

    const cancelled = original.find(({ localDate }) => localDate === "2026-03-08");
    const futureCancelled = original.find(
      ({ localDate }) => localDate === "2026-03-15",
    );
    await cancelClassSessionForOwner(cancelled!.id, ownerAthleteId);
    await cancelClassSessionForOwner(futureCancelled!.id, ownerAthleteId);

    await updateClassForOwner(
      classId,
      ownerAthleteId,
      {
        name: "6am CrossFit",
        coachAthleteId,
        weeklyTimes: [{ dayOfWeek: 0, localTime: "06:00" }],
        timeZone: "America/Chicago",
        capacity: 25,
      },
      new Date("2026-03-08T20:00:00Z"),
      "2026-03-15",
    );
    const afterSameDaySave = await getClassSessionsForGym(
      gymId,
      ownerAthleteId,
      [classId],
    );
    expect(
      afterSameDaySave.find(({ localDate }) => localDate === "2026-03-08"),
    ).toMatchObject({ id: cancelled!.id, cancelled: true });
    expect(
      afterSameDaySave.find(({ localDate }) => localDate === "2026-03-15"),
    ).toMatchObject({ id: futureCancelled!.id, cancelled: true });
    expect(
      (
        await getUpcomingClassSessionsForAthlete(
          memberAthleteId,
          new Date("2026-03-01T00:00:00Z"),
        )
      ).map(({ localDate, gymName }) => ({ localDate, gymName })),
    ).toEqual([
      { localDate: "2026-03-01", gymName: "Iron Ridge" },
    ]);

    await expect(
      updateClassForOwner(
        classId,
        coachAthleteId,
        {
          name: "7am CrossFit",
          coachAthleteId,
          weeklyTimes: [{ dayOfWeek: 1, localTime: "07:00" }],
          timeZone: "America/New_York",
          capacity: 20,
        },
        new Date("2026-03-09T00:00:00Z"),
        "2026-03-23",
      ),
    ).rejects.toThrow("Gym not found");

    await updateClassForOwner(
      classId,
      ownerAthleteId,
      {
        name: "7am CrossFit",
        coachAthleteId,
        weeklyTimes: [{ dayOfWeek: 1, localTime: "07:00" }],
        timeZone: "America/New_York",
        capacity: 20,
      },
      new Date("2026-03-09T00:00:00Z"),
      "2026-03-23",
    );

    const changed = await getClassSessionsForGym(
      gymId,
      ownerAthleteId,
      [classId],
    );
    expect(changed.map(({ localDate, cancelled }) => ({ localDate, cancelled }))).toEqual([
      { localDate: "2026-03-01", cancelled: false },
      { localDate: "2026-03-08", cancelled: true },
      { localDate: "2026-03-09", cancelled: false },
      { localDate: "2026-03-16", cancelled: false },
      { localDate: "2026-03-23", cancelled: false },
    ]);
    expect(changed.find(({ localDate }) => localDate === "2026-03-08")).toMatchObject({
      timeZone: "America/Chicago",
      coachName: "Coach",
    });
    expect(changed.find(({ localDate }) => localDate === "2026-03-09")).toMatchObject({
      timeZone: "America/New_York",
      coachName: "Coach",
    });

    await ensureUpcomingClassSessions(
      memberAthleteId,
      new Date("2026-03-24T00:00:00Z"),
      21,
    );
    const extended = await getClassSessionsForGym(
      gymId,
      memberAthleteId,
      [classId],
    );
    await ensureUpcomingClassSessions(
      memberAthleteId,
      new Date("2026-03-24T00:00:00Z"),
      21,
    );
    expect(
      (await getClassSessionsForGym(gymId, memberAthleteId, [classId])).map(
        ({ id }) => id,
      ),
    ).toEqual(extended.map(({ id }) => id));
    expect(extended.map(({ localDate }) => localDate)).toEqual(
      expect.arrayContaining(["2026-03-30", "2026-04-06", "2026-04-13"]),
    );

    await grantGymMembership(gymId, ownerAthleteId, {
      email: `${coachUserId}@test.local`,
      role: MembershipRole.Member,
    }, new Date("2026-03-24T00:00:00Z"));
    expect(await getClassesForGym(gymId, ownerAthleteId)).toEqual([
      expect.objectContaining({ id: classId, coachAthleteId: null }),
    ]);
    const afterDowngrade = await getClassSessionsForGym(
      gymId,
      ownerAthleteId,
      [classId],
    );
    expect(
      afterDowngrade.find(({ localDate }) => localDate === "2026-03-23"),
    ).toMatchObject({ coachName: "Coach" });
    expect(
      afterDowngrade.find(({ localDate }) => localDate === "2026-03-30"),
    ).toMatchObject({ coachName: null });
    await grantGymMembership(gymId, ownerAthleteId, {
      email: `${coachUserId}@test.local`,
      role: MembershipRole.Coach,
    });
    await updateClassForOwner(
      classId,
      ownerAthleteId,
      {
        name: "7am CrossFit",
        coachAthleteId,
        weeklyTimes: [{ dayOfWeek: 1, localTime: "07:00" }],
        timeZone: "America/New_York",
        capacity: 20,
      },
      new Date("2026-04-20T00:00:00Z"),
      "2026-04-20",
    );
    await revokeGymMembership(
      gymId,
      ownerAthleteId,
      coachAthleteId,
      new Date("2026-04-20T00:00:00Z"),
    );
    expect(await getClassesForGym(gymId, ownerAthleteId)).toEqual([
      expect.objectContaining({ id: classId, coachAthleteId: null }),
    ]);

    await revokeGymMembership(gymId, ownerAthleteId, memberAthleteId);
    await expect(
      getUpcomingClassSessionsForAthlete(
        memberAthleteId,
        new Date("2026-03-01T00:00:00Z"),
      ),
    ).resolves.toEqual([]);
  });
});
