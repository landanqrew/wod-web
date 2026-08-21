import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, pool } from "../db";
import { athletes, gyms, memberships, users, workouts } from "../db/schema";
import {
  getClassSessionsForGym,
  getUpcomingClassSessionsForAthlete,
} from "../data/gym-class";
import { getProgrammedWorkoutForSession } from "../data/programmed-workout";
import { Equipment, EQUIPMENT_PRESETS } from "../domain/models/equipment";
import { MembershipRole } from "../domain/models/gym";
import { Muscle } from "../domain/models/body";
import { getMovementOrThrow } from "../domain/movements/library";
import {
  ScoreType,
  WorkoutFormat,
  type Workout,
} from "../domain/models/workout";
import { newId } from "../ids";
import { createClassForOwner } from "./gym-class";
import {
  createGymForOwner,
  grantGymMembership,
  updateGymForOwner,
} from "./gym";
import { upsertWorkout } from "./log";
import {
  generateProgrammedWorkoutForGymDay,
  programGymDay,
  programGymDayInTransaction,
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
    const programmed = await programGymDay(
      gymId,
      coachAthleteId,
      "2027-03-01",
      manualWorkout,
      sourceWorkoutId,
    );
    expect(programmed.programmedWorkoutIds).toHaveLength(2);
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

    await updateGymForOwner(gymId, ownerAthleteId, {
      name: "Iron Ridge",
      recoveryWindowHours: 48,
      floor: [...EQUIPMENT_PRESETS.fullGym]
        .filter((equipment) => equipment !== Equipment.None)
        .map((equipment) => ({ equipment })),
    });
    const recoveryClassId = await createClassForOwner(
      gymId,
      ownerAthleteId,
      {
        name: "Recovery Window Test",
        coachAthleteId,
        weeklyTimes: [
          { dayOfWeek: 0, localTime: "08:00" },
          { dayOfWeek: 1, localTime: "06:00" },
          { dayOfWeek: 2, localTime: "06:00" },
        ],
        timeZone: "America/Chicago",
        capacity: 20,
      },
      { startDate: "2027-03-07", endDate: "2027-03-09" },
    );
    await programGymDay(
      gymId,
      coachAthleteId,
      "2027-03-07",
      manualWorkout,
    );
    await programGymDay(gymId, coachAthleteId, "2027-03-08", {
      ...manualWorkout,
      id: newId("wod"),
      name: "Metcon shoulders",
      format: WorkoutFormat.AMRAP,
      movements: [
        {
          movementId: "strict_press",
          reps: 10,
          rxLoad: { male: 95, female: 65 },
        },
      ],
      rounds: undefined,
      timeCap: 12,
      scoreType: ScoreType.RoundsAndReps,
    });
    const warning = await programGymDay(
      gymId,
      coachAthleteId,
      "2027-03-09",
      {
        ...manualWorkout,
        id: newId("wod"),
        movements: [
          {
            movementId: "front_squat",
            reps: 5,
            rxLoad: { male: 185, female: 125 },
          },
        ],
      },
    );
    expect(warning.warningMuscles).toEqual(
      expect.arrayContaining([Muscle.Quads, Muscle.Glutes]),
    );
    expect(warning.recoveringMuscles).not.toContain(Muscle.Shoulders);

    const regenerated = await generateProgrammedWorkoutForGymDay(
      gymId,
      coachAthleteId,
      "2027-03-09",
      { format: WorkoutFormat.AMRAP, movementCount: 3 },
    );
    expect(regenerated.recoveringMuscles).toEqual(
      expect.arrayContaining([Muscle.Quads, Muscle.Glutes]),
    );
    const recoverySessions = await getClassSessionsForGym(
      gymId,
      ownerAthleteId,
      [recoveryClassId],
    );
    const generatedTarget = recoverySessions.find(
      ({ localDate }) => localDate === "2027-03-09",
    );
    const generatedView = await getProgrammedWorkoutForSession(
      generatedTarget!.id,
      ownerAthleteId,
    );
    const recovering = new Set(regenerated.recoveringMuscles);
    expect(
      generatedView?.workout.movements.every((prescription) => {
        const movement = getMovementOrThrow(prescription.movementId);
        return [...movement.primaryMuscles, ...movement.secondaryMuscles].every(
          (muscle) => !recovering.has(muscle),
        );
      }),
    ).toBe(true);

    const concurrentClassId = await createClassForOwner(
      gymId,
      ownerAthleteId,
      {
        name: "Concurrent Recovery Window",
        coachAthleteId,
        weeklyTimes: [
          { dayOfWeek: 0, localTime: "08:00" },
          { dayOfWeek: 1, localTime: "06:00" },
        ],
        timeZone: "America/Chicago",
        capacity: 20,
      },
      { startDate: "2027-03-14", endDate: "2027-03-15" },
    );
    let releaseStrength: (() => void) | undefined;
    const strengthCanCommit = new Promise<void>((resolve) => {
      releaseStrength = resolve;
    });
    let strengthWritten: (() => void) | undefined;
    const strengthIsWritten = new Promise<void>((resolve) => {
      strengthWritten = resolve;
    });
    const concurrentStrength = db.transaction(async (tx) => {
      await programGymDayInTransaction(
        tx,
        gymId!,
        coachAthleteId,
        "2027-03-14",
        manualWorkout,
      );
      strengthWritten?.();
      await strengthCanCommit;
    });
    await strengthIsWritten;
    const concurrentGeneration = generateProgrammedWorkoutForGymDay(
      gymId,
      coachAthleteId,
      "2027-03-15",
      { format: WorkoutFormat.AMRAP, movementCount: 3 },
    );
    const generationState = await Promise.race([
      concurrentGeneration.then(() => "completed" as const),
      new Promise<"waiting">((resolve) =>
        setTimeout(() => resolve("waiting"), 100),
      ),
    ]);
    releaseStrength?.();
    const [, concurrentResult] = await Promise.all([
      concurrentStrength,
      concurrentGeneration,
    ]);
    expect(generationState).toBe("waiting");
    expect(concurrentResult.recoveringMuscles).toEqual(
      expect.arrayContaining([Muscle.Quads, Muscle.Glutes]),
    );
    const concurrentSessions = await getClassSessionsForGym(
      gymId,
      ownerAthleteId,
      [concurrentClassId],
    );
    const concurrentTarget = concurrentSessions.find(
      ({ localDate }) => localDate === "2027-03-15",
    );
    const concurrentView = await getProgrammedWorkoutForSession(
      concurrentTarget!.id,
      ownerAthleteId,
    );
    const concurrentRecovering = new Set(concurrentResult.recoveringMuscles);
    expect(
      concurrentView?.workout.movements.every((prescription) => {
        const movement = getMovementOrThrow(prescription.movementId);
        return [...movement.primaryMuscles, ...movement.secondaryMuscles].every(
          (muscle) => !concurrentRecovering.has(muscle),
        );
      }),
    ).toBe(true);

    await updateGymForOwner(gymId, ownerAthleteId, {
      name: "Iron Ridge",
      recoveryWindowHours: 48,
      floor: [...EQUIPMENT_PRESETS.fullGym]
        .filter((equipment) => equipment !== Equipment.None)
        .map((equipment) => ({
          equipment,
          ...(equipment === Equipment.Rower ? { stationCount: 1 } : {}),
        })),
    });
    const stationClassId = await createClassForOwner(
      gymId,
      ownerAthleteId,
      {
        name: "Station Advisory",
        coachAthleteId,
        weeklyTimes: [{ dayOfWeek: 1, localTime: "06:00" }],
        timeZone: "America/Chicago",
        capacity: 20,
      },
      { startDate: "2027-03-22", endDate: "2027-03-22" },
    );
    const [stationSession] = await getClassSessionsForGym(
      gymId,
      ownerAthleteId,
      [stationClassId],
    );
    for (const reservingAthleteId of [
      ownerAthleteId,
      coachAthleteId,
      memberAthleteId,
    ]) {
      await reserveClassSessionForAthlete(
        stationSession.id,
        reservingAthleteId,
        new Date("2027-03-01T00:00:00Z"),
      );
    }
    const stationWorkout: Workout = {
      id: newId("wod"),
      name: "Row and thrusters",
      format: WorkoutFormat.RoundsForTime,
      movements: [
        { movementId: "row", distance: 500 },
        {
          movementId: "thruster",
          reps: 15,
          rxLoad: { male: 95, female: 65 },
        },
      ],
      rounds: 5,
      timeCap: 20,
      scoreType: ScoreType.Time,
      isBenchmark: false,
    };
    const stationResult = await programGymDay(
      gymId,
      coachAthleteId,
      "2027-03-22",
      stationWorkout,
    );
    expect(stationResult.stationWarnings).toEqual([
      expect.objectContaining({
        classSessionId: stationSession.id,
        movementId: "row",
        movementName: "Row",
        equipment: Equipment.Rower,
        reservedHeadcount: 3,
        availableStations: 1,
        shortfall: 2,
      }),
    ]);
    await expect(
      getProgrammedWorkoutForSession(stationSession.id, ownerAthleteId),
    ).resolves.toMatchObject({ workout: stationWorkout });

    await updateGymForOwner(gymId, ownerAthleteId, {
      name: "Iron Ridge",
      recoveryWindowHours: 48,
      floor: [...EQUIPMENT_PRESETS.fullGym]
        .filter((equipment) => equipment !== Equipment.None)
        .map((equipment) => ({
          equipment,
          ...(equipment === Equipment.Rower ? { stationCount: 3 } : {}),
        })),
    });
    await expect(
      updateProgrammedWorkoutForSession(
        stationSession.id,
        coachAthleteId,
        stationWorkout,
      ),
    ).resolves.toMatchObject({ stationWarnings: [] });

    let releaseRevocation: (() => void) | undefined;
    const revocationCanCommit = new Promise<void>((resolve) => {
      releaseRevocation = resolve;
    });
    let membershipDeleted: (() => void) | undefined;
    const membershipIsDeleted = new Promise<void>((resolve) => {
      membershipDeleted = resolve;
    });
    const blockingRevocation = db.transaction(async (tx) => {
      await tx
        .select({ athleteId: memberships.athleteId })
        .from(memberships)
        .where(
          and(
            eq(memberships.gymId, gymId!),
            eq(memberships.athleteId, coachAthleteId),
          ),
        )
        .for("update");
      await tx
        .delete(memberships)
        .where(
          and(
            eq(memberships.gymId, gymId!),
            eq(memberships.athleteId, coachAthleteId),
          ),
        );
      membershipDeleted?.();
      await revocationCanCommit;
    });
    await membershipIsDeleted;
    const revokedCoachProgramming = programGymDay(
      gymId,
      coachAthleteId,
      "2027-03-15",
      manualWorkout,
    );
    const revokedCoachState = await Promise.race([
      revokedCoachProgramming.then(
        () => "completed" as const,
        () => "denied" as const,
      ),
      new Promise<"waiting">((resolve) =>
        setTimeout(() => resolve("waiting"), 100),
      ),
    ]);
    releaseRevocation?.();
    await blockingRevocation;
    expect(revokedCoachState).toBe("waiting");
    await expect(revokedCoachProgramming).rejects.toThrow("Gym not found");
  });
});
