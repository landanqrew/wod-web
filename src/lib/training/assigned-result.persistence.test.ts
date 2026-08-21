import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, pool } from "../db";
import { athletes, classSessions, gyms, users } from "../db/schema";
import { getAssignedWorkoutForAthlete } from "../data/assigned-workout";
import { getClassSessionsForGym, getUpcomingClassSessionsForAthlete } from "../data/gym-class";
import {
  getClassSessionResultContext,
  getPRs,
  getResults,
  getWorkout,
} from "../data/training";
import { MembershipRole } from "../domain/models/gym";
import { Equipment } from "../domain/models/equipment";
import { ScoreType, WorkoutFormat, type Workout } from "../domain/models/workout";
import { VolumeTracker } from "../domain/tracking/volume-tracker";
import { newId } from "../ids";
import { createGymForOwner, grantGymMembership, revokeGymMembership } from "./gym";
import { createClassForOwner } from "./gym-class";
import { logAssignedWorkoutResultForAthlete } from "./log";
import { overrideAssignedWorkoutForAthlete } from "./assigned-workout-override";
import {
  programGymDay,
  updateProgrammedWorkoutForSession,
} from "./programmed-workout";
import { reserveClassSessionForAthlete } from "./reservation";

const ownerUserId = newId("test_user");
const ownerAthleteId = newId("test_ath");
const memberUserId = newId("test_user");
const memberAthleteId = newId("test_ath");
let gymId: string | undefined;

const workout: Workout = {
  id: newId("wod"),
  name: "Assigned strength",
  format: WorkoutFormat.Strength,
  movements: [{ movementId: "back_squat", reps: 5, rxLoad: { male: 225, female: 155 } }],
  rounds: 5,
  scoreType: ScoreType.Load,
  isBenchmark: false,
};

beforeAll(async () => {
  await db.insert(users).values([
    { id: ownerUserId, name: "Owner", email: `${ownerUserId}@test.local` },
    { id: memberUserId, name: "Member", email: `${memberUserId}@test.local` },
  ]);
  await db.insert(athletes).values([
    {
      id: ownerAthleteId,
      userId: ownerUserId,
      name: "Owner",
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
  await db.delete(users).where(eq(users.id, memberUserId));
  await pool.end();
});

describe("Assigned Workout result ledger", () => {
  it("logs the athlete version through the shared PR and volume ledger, retaining history after leaving", async () => {
    const testNow = new Date("2027-06-15T00:00:00Z");
    gymId = await createGymForOwner(ownerAthleteId, {
      name: "Result Gym",
      floor: [{ equipment: Equipment.Barbell }, { equipment: Equipment.Plates }, { equipment: Equipment.SquatRack }],
    });
    await grantGymMembership(gymId, ownerAthleteId, {
      email: `${memberUserId}@test.local`,
      role: MembershipRole.Member,
    });
    const classId = await createClassForOwner(
      gymId,
      ownerAthleteId,
      {
        name: "Monday strength",
        coachAthleteId: ownerAthleteId,
        weeklyTimes: [{ dayOfWeek: 1, localTime: "06:00" }],
        timeZone: "America/Chicago",
        capacity: 12,
      },
      { startDate: "2027-06-07", endDate: "2027-06-14" }
    );
    const sessions = await getClassSessionsForGym(gymId, ownerAthleteId, [classId]);
    await programGymDay(gymId, ownerAthleteId, "2027-06-07", workout);
    await programGymDay(gymId, ownerAthleteId, "2027-06-14", workout);
    await reserveClassSessionForAthlete(sessions[0].id, memberAthleteId, new Date("2027-01-01T00:00:00Z"));
    await reserveClassSessionForAthlete(sessions[1].id, memberAthleteId, new Date("2027-01-01T00:00:00Z"));
    const assigned = await getAssignedWorkoutForAthlete(sessions[0].id, memberAthleteId);

    await expect(
      logAssignedWorkoutResultForAthlete(sessions[0].id, ownerAthleteId, {
        performedAt: "2027-06-07T12:00:00Z",
        scoreType: ScoreType.Load,
        rx: true,
        movementResults: [],
      })
    ).rejects.toThrow("Assigned Workout not found");

    const logged = await logAssignedWorkoutResultForAthlete(
      sessions[0].id,
      memberAthleteId,
      {
        performedAt: "2027-06-07T12:00:00Z",
        scoreType: ScoreType.Load,
        peakLoad: 155,
        rpe: 8,
        rx: true,
        movementResults: [
          { movementId: "back_squat", reps: 5, load: 155, rx: true },
        ],
      },
      testNow,
    );

    expect(logged.result).toMatchObject({
      workoutId: assigned?.id,
      assignedWorkoutId: assigned?.id,
      classSessionId: sessions[0].id,
    });
    expect(logged.prs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          referenceType: "movement",
          referenceId: "back_squat",
          value: 155,
        }),
      ])
    );
    await expect(
      logAssignedWorkoutResultForAthlete(
        sessions[0].id,
        memberAthleteId,
        {
          performedAt: "2027-06-07T12:05:00Z",
          scoreType: ScoreType.Load,
          peakLoad: 160,
          rx: true,
          movementResults: [],
        },
        testNow,
      )
    ).rejects.toThrow();
    await expect(
      overrideAssignedWorkoutForAthlete(sessions[0].id, memberAthleteId, {
        movementIndex: 0,
        load: 145,
      })
    ).rejects.toThrow("cannot be edited");
    await updateProgrammedWorkoutForSession(sessions[0].id, ownerAthleteId, {
      ...workout,
      name: "Coach changed this later",
      movements: [
        { movementId: "deadlift", reps: 5, rxLoad: { male: 315, female: 225 } },
      ],
    });
    await expect(
      getAssignedWorkoutForAthlete(sessions[0].id, memberAthleteId),
    ).resolves.toMatchObject({ workout: { name: "Assigned strength" } });
    await expect(getWorkout(assigned!.id)).resolves.toMatchObject({
      name: "Assigned strength",
      movements: [expect.objectContaining({ movementId: "back_squat", load: 155 })],
    });
    await expect(
      logAssignedWorkoutResultForAthlete(
        sessions[1].id,
        memberAthleteId,
        {
          performedAt: "2027-06-16T12:00:00Z",
          scoreType: ScoreType.Load,
          peakLoad: 155,
          rx: true,
          movementResults: [],
        },
        testNow,
      ),
    ).rejects.toThrow("future");
    await expect(
      getUpcomingClassSessionsForAthlete(
        memberAthleteId,
        new Date("2027-06-01T00:00:00Z"),
      ),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: sessions[0].id, resultLogged: true }),
        expect.objectContaining({ id: sessions[1].id, resultLogged: false }),
      ]),
    );

    let releaseCancellation: (() => void) | undefined;
    const cancellationCanCommit = new Promise<void>((resolve) => {
      releaseCancellation = resolve;
    });
    let cancellationWritten: (() => void) | undefined;
    const cancellationIsWritten = new Promise<void>((resolve) => {
      cancellationWritten = resolve;
    });
    const cancellation = db.transaction(async (tx) => {
      await tx
        .update(classSessions)
        .set({ cancelledAt: new Date("2027-06-14T10:00:00Z") })
        .where(eq(classSessions.id, sessions[1].id));
      cancellationWritten?.();
      await cancellationCanCommit;
    });
    await cancellationIsWritten;
    const canceledLog = logAssignedWorkoutResultForAthlete(
      sessions[1].id,
      memberAthleteId,
      {
        performedAt: "2027-06-14T12:00:00Z",
        scoreType: ScoreType.Load,
        peakLoad: 155,
        rx: true,
        movementResults: [],
      },
      testNow,
    );
    const canceledLogState = await Promise.race([
      canceledLog.then(() => "completed" as const, () => "rejected" as const),
      new Promise<"waiting">((resolve) =>
        setTimeout(() => resolve("waiting"), 100),
      ),
    ]);
    releaseCancellation?.();
    await cancellation;
    expect(canceledLogState).toBe("waiting");
    await expect(canceledLog).rejects.toThrow("canceled Class Session");
    const results = await getResults(memberAthleteId);
    expect(new VolumeTracker(results).summarize("2027-06-01", "2027-06-30")).toMatchObject({
      totalWorkouts: 1,
      totalVolumeLbs: 775,
    });
    expect(await getPRs(memberAthleteId)).toHaveLength(logged.prs.length);
    expect(results).toHaveLength(1); // The second Reservation is a no-show.
    await expect(getClassSessionResultContext(sessions[0].id)).resolves.toMatchObject({
      className: "Monday strength",
      gymName: "Result Gym",
    });

    await revokeGymMembership(gymId, ownerAthleteId, memberAthleteId);
    await expect(getResults(memberAthleteId)).resolves.toMatchObject([
      { id: logged.result.id, classSessionId: sessions[0].id },
    ]);
  });
});
