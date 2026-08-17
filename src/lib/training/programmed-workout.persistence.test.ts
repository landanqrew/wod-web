import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, pool } from "../db";
import { athletes, gyms, users, workouts } from "../db/schema";
import {
  getClassSessionsForGym,
  getUpcomingClassSessionsForAthlete,
} from "../data/gym-class";
import { getProgrammedWorkoutForSession } from "../data/programmed-workout";
import { Equipment } from "../domain/models/equipment";
import { MembershipRole } from "../domain/models/gym";
import {
  ScoreType,
  WorkoutFormat,
  type Workout,
} from "../domain/models/workout";
import { newId } from "../ids";
import { createClassForOwner } from "./gym-class";
import { createGymForOwner, grantGymMembership } from "./gym";
import { upsertWorkout } from "./log";
import {
  generateProgrammedWorkoutForGymDay,
  programGymDay,
  updateProgrammedWorkoutForSession,
} from "./programmed-workout";
import { reserveClassSessionForAthlete } from "./reservation";

const ownerUserId = newId("test_user");
const ownerAthleteId = newId("test_ath");
const coachUserId = newId("test_user");
const coachAthleteId = newId("test_ath");
const memberUserId = newId("test_user");
const memberAthleteId = newId("test_ath");
const sourceWorkoutId = newId("wod");
let gymId: string | undefined;

const manualWorkout: Workout = {
  id: newId("wod"),
  name: "Heavy Monday",
  format: WorkoutFormat.Strength,
  movements: [
    {
      movementId: "back_squat",
      reps: 5,
      rxLoad: { male: 225, female: 155 },
    },
    {
      movementId: "row",
      calories: 20,
      notes: "Hand-authored despite no rowers on the Gym floor",
    },
  ],
  rounds: 5,
  scoreType: ScoreType.Load,
  isBenchmark: false,
};

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
      equipment: [],
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
  await db.delete(workouts).where(eq(workouts.id, sourceWorkoutId));
  await db.delete(users).where(eq(users.id, ownerUserId));
  await db.delete(users).where(eq(users.id, coachUserId));
  await db.delete(users).where(eq(users.id, memberUserId));
  await pool.end();
});

describe("Programmed Workouts", () => {
  it("fans out embedded Rx prescriptions, isolates edits, and authorizes readers", async () => {
    gymId = await createGymForOwner(ownerAthleteId, {
      name: "Iron Ridge",
      floor: [{ equipment: Equipment.Barbell, stationCount: 8 }],
    });
    await grantGymMembership(gymId, ownerAthleteId, {
      email: `${coachUserId}@test.local`,
      role: MembershipRole.Coach,
    });
    await grantGymMembership(gymId, ownerAthleteId, {
      email: `${memberUserId}@test.local`,
      role: MembershipRole.Member,
    });
    const classIds = await Promise.all(
      ["06:00", "17:30"].map((localTime) =>
        createClassForOwner(
          gymId!,
          ownerAthleteId,
          {
            name: `${localTime} CrossFit`,
            coachAthleteId,
            weeklyTimes: [{ dayOfWeek: 1, localTime }],
            timeZone: "America/Chicago",
            capacity: 20,
          },
          { startDate: "2027-03-01", endDate: "2027-03-01" },
        ),
      ),
    );
    const sessions = await getClassSessionsForGym(
      gymId,
      ownerAthleteId,
      classIds,
    );
    expect(sessions).toHaveLength(2);
    await reserveClassSessionForAthlete(
      sessions[0].id,
      memberAthleteId,
      new Date("2027-02-01T00:00:00Z"),
    );
    await expect(
      getProgrammedWorkoutForSession(sessions[0].id, memberAthleteId),
    ).resolves.toBeNull();

    await upsertWorkout(
      { ...manualWorkout, id: sourceWorkoutId, isBenchmark: true },
      ownerAthleteId,
    );
    const programmedIds = await programGymDay(
      gymId,
      coachAthleteId,
      "2027-03-01",
      manualWorkout,
      sourceWorkoutId,
    );
    expect(programmedIds).toHaveLength(2);
    expect(
      await getUpcomingClassSessionsForAthlete(
        memberAthleteId,
        new Date("2027-02-01T00:00:00Z"),
        gymId,
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: sessions[0].id, workoutPosted: true }),
      ]),
    );

    await expect(
      programGymDay(gymId, coachAthleteId, "2027-03-01", {
        ...manualWorkout,
        movements: [{ movementId: "back_squat", reps: 5, load: 225 }],
      }),
    ).rejects.toThrow("Rx Pair");
    await expect(
      programGymDay(gymId, coachAthleteId, "2027-03-01", {
        ...manualWorkout,
        movements: [{ movementId: "back_squat", reps: 5 }],
      }),
    ).rejects.toThrow("Rx Pair");

    const reservedView = await getProgrammedWorkoutForSession(
      sessions[0].id,
      memberAthleteId,
    );
    expect(reservedView).toMatchObject({
      sourceWorkoutId,
      programmedByAthleteId: coachAthleteId,
      workout: manualWorkout,
    });
    await db
      .update(workouts)
      .set({ name: "Corrected canonical source", movements: [] })
      .where(eq(workouts.id, sourceWorkoutId));
    await expect(
      getProgrammedWorkoutForSession(sessions[0].id, memberAthleteId),
    ).resolves.toMatchObject({ workout: manualWorkout });
    await db.delete(workouts).where(eq(workouts.id, sourceWorkoutId));
    await expect(
      getProgrammedWorkoutForSession(sessions[0].id, memberAthleteId),
    ).resolves.toMatchObject({ sourceWorkoutId: null, workout: manualWorkout });
    await expect(
      getProgrammedWorkoutForSession(sessions[1].id, memberAthleteId),
    ).rejects.toThrow("Class Session not found");

    const untouched = await getProgrammedWorkoutForSession(
      sessions[1].id,
      ownerAthleteId,
    );
    const edited = {
      ...manualWorkout,
      name: "Evening Heavy Monday",
      movements: [
        {
          movementId: "front_squat",
          reps: 3,
          rxLoad: { male: 205, female: 145 },
        },
      ],
    };
    await updateProgrammedWorkoutForSession(
      sessions[0].id,
      coachAthleteId,
      edited,
    );
    await expect(
      getProgrammedWorkoutForSession(sessions[0].id, coachAthleteId),
    ).resolves.toMatchObject({ workout: edited });
    await expect(
      getProgrammedWorkoutForSession(sessions[1].id, ownerAthleteId),
    ).resolves.toEqual(untouched);

    await expect(
      programGymDay(
        gymId,
        memberAthleteId,
        "2027-03-01",
        manualWorkout,
      ),
    ).rejects.toThrow("Gym not found");
    await expect(
      updateProgrammedWorkoutForSession(
        sessions[0].id,
        memberAthleteId,
        manualWorkout,
      ),
    ).rejects.toThrow("Class Session not found");

    await generateProgrammedWorkoutForGymDay(
      gymId,
      ownerAthleteId,
      "2027-03-01",
      { format: WorkoutFormat.AMRAP, movementCount: 6 },
    );
    const generated = await getProgrammedWorkoutForSession(
      sessions[0].id,
      ownerAthleteId,
    );
    expect(generated?.workout.movements).not.toHaveLength(0);
    expect(
      generated?.workout.movements.every((prescription) =>
        prescription.movement?.equipment.every(
          (equipment) =>
            equipment === Equipment.None || equipment === Equipment.Barbell,
        ),
      ),
    ).toBe(true);
    for (const prescription of generated?.workout.movements ?? []) {
      if (prescription.movement?.loadType === "weighted") {
        expect(prescription.rxLoad).toEqual({
          male: prescription.movement.defaultLoadMale,
          female: prescription.movement.defaultLoadFemale,
        });
        expect(prescription.load).toBeUndefined();
      }
    }
  });
});
