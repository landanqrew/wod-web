import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, pool } from "../db";
import { athletes, gyms, impediments, users } from "../db/schema";
import { getAssignedWorkoutForAthlete } from "../data/assigned-workout";
import { getClassSessionsForGym } from "../data/gym-class";
import { Joint } from "../domain/models/body";
import { Equipment } from "../domain/models/equipment";
import { MembershipRole } from "../domain/models/gym";
import { ImpedimentCategory, ImpedimentSeverity } from "../domain/models/impediment";
import { ScoreType, WorkoutFormat, type Workout } from "../domain/models/workout";
import { newId } from "../ids";
import { createGymForOwner, grantGymMembership } from "./gym";
import { createClassForOwner } from "./gym-class";
import { overrideAssignedWorkoutForAthlete } from "./assigned-workout-override";
import { programGymDay, updateProgrammedWorkoutForSession } from "./programmed-workout";
import { addImpedimentFor, removeImpedimentFor } from "./profile";
import { reserveClassSessionForAthlete } from "./reservation";

const ownerUserId = newId("test_user");
const ownerAthleteId = newId("test_ath");
const memberUserId = newId("test_user");
const memberAthleteId = newId("test_ath");
const outsiderUserId = newId("test_user");
const outsiderAthleteId = newId("test_ath");
let gymId: string | undefined;

function programmed(
  firstMovementId = "back_squat",
  reps = 5,
  load = 225,
): Workout {
  return {
    id: newId("wod"),
    name: "Reconcile me",
    format: WorkoutFormat.Strength,
    movements: [
      {
        movementId: firstMovementId,
        reps,
        rxLoad: { male: load, female: Math.round(load * 0.7) },
      },
      { movementId: "plank", duration: 30 },
    ],
    rounds: 5,
    scoreType: ScoreType.Load,
    isBenchmark: false,
  };
}

beforeAll(async () => {
  await db.insert(users).values([
    { id: ownerUserId, name: "Owner", email: `${ownerUserId}@test.local` },
    { id: memberUserId, name: "Member", email: `${memberUserId}@test.local` },
    { id: outsiderUserId, name: "Outsider", email: `${outsiderUserId}@test.local` },
  ]);
  await db.insert(athletes).values([
    { id: ownerAthleteId, userId: ownerUserId, name: "Owner", sex: "male", equipment: [] },
    { id: memberAthleteId, userId: memberUserId, name: "Member", sex: "male", equipment: [] },
    { id: outsiderAthleteId, userId: outsiderUserId, name: "Outsider", sex: "male", equipment: [] },
  ]);
});

afterAll(async () => {
  if (gymId) await db.delete(gyms).where(eq(gyms.id, gymId));
  await db.delete(users).where(eq(users.id, ownerUserId));
  await db.delete(users).where(eq(users.id, memberUserId));
  await db.delete(users).where(eq(users.id, outsiderUserId));
  await pool.end();
});

describe("Assigned Workout overrides and reconciliation", () => {
  it("applies athlete edits immediately and reconciles every provenance rung", async () => {
    gymId = await createGymForOwner(ownerAthleteId, {
      name: "Reconciliation Gym",
      floor: [
        { equipment: Equipment.Barbell },
        { equipment: Equipment.Plates },
        { equipment: Equipment.SquatRack },
        { equipment: Equipment.Bench },
        { equipment: Equipment.GHD },
      ],
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
        capacity: 20,
      },
      { startDate: "2027-04-05", endDate: "2027-04-05" },
    );
    const [session] = await getClassSessionsForGym(gymId, ownerAthleteId, [classId]);
    await programGymDay(gymId, ownerAthleteId, session.localDate, programmed());
    await reserveClassSessionForAthlete(
      session.id,
      memberAthleteId,
      new Date("2027-01-01T00:00:00Z"),
    );

    await overrideAssignedWorkoutForAthlete(session.id, memberAthleteId, {
      movementIndex: 0,
      reps: 7,
      load: 250,
    });
    await overrideAssignedWorkoutForAthlete(session.id, memberAthleteId, {
      movementIndex: 1,
      duration: 45,
    });
    let assigned = await getAssignedWorkoutForAthlete(session.id, memberAthleteId);
    expect(assigned?.workout.movements).toMatchObject([
      { movementId: "back_squat", reps: 7, load: 250 },
      { movementId: "plank", duration: 45 },
    ]);
    expect(assigned?.provenance).toMatchObject([
      { reps: "overridden", load: "overridden" },
      { duration: "overridden" },
    ]);
    expect(assigned?.changes.flatMap(({ explanations }) => explanations).join(" "))
      .toContain("heavier than programmed");

    await expect(
      overrideAssignedWorkoutForAthlete(session.id, outsiderAthleteId, {
        movementIndex: 0,
        load: 300,
      }),
    ).rejects.toThrow("Assigned Workout not found");
    await overrideAssignedWorkoutForAthlete(session.id, memberAthleteId, {
      movementIndex: 0,
      movementId: "front_squat",
    });
    await addImpedimentFor(memberAthleteId, {
      category: ImpedimentCategory.AcuteInjury,
      severity: ImpedimentSeverity.Moderate,
      affectedMuscles: [],
      affectedJoints: [Joint.Ankles],
      description: "Temporary ankle issue",
      startDate: "2027-01-01",
    });
    const [ankleImpediment] = await db
      .select({ id: impediments.id })
      .from(impediments)
      .where(eq(impediments.athleteId, memberAthleteId))
      .limit(1);
    assigned = await getAssignedWorkoutForAthlete(session.id, memberAthleteId);
    expect(assigned?.workout.movements[0].movementId).toBe("front_squat");
    expect(assigned?.changes.flatMap(({ explanations }) => explanations).join(" "))
      .toContain("unavailable under current constraints");
    await removeImpedimentFor(memberAthleteId, ankleImpediment.id);
    assigned = await getAssignedWorkoutForAthlete(session.id, memberAthleteId);
    expect(assigned?.changes.flatMap(({ explanations }) => explanations).join(" "))
      .not.toContain("unavailable under current constraints");
    await updateProgrammedWorkoutForSession(
      session.id,
      ownerAthleteId,
      programmed("back_squat", 3, 185),
    );
    assigned = await getAssignedWorkoutForAthlete(session.id, memberAthleteId);
    expect(assigned?.workout.movements[0].movementId).toBe("front_squat");
    expect(assigned?.provenance[0].movementId).toBe("overridden");
    expect(assigned?.workout.movements[1].duration).toBe(45);
    expect(assigned?.provenance[1].duration).toBe("overridden");

    await updateProgrammedWorkoutForSession(
      session.id,
      ownerAthleteId,
      programmed("deadlift", 4, 275),
    );
    assigned = await getAssignedWorkoutForAthlete(session.id, memberAthleteId);
    expect(assigned?.workout.movements[0]).toMatchObject({
      movementId: "deadlift",
      reps: 4,
      load: 275,
    });
    expect(assigned?.changes.flatMap(({ explanations }) => explanations).join(" "))
      .toContain("discarded athlete overrides");

    const unchangedAt = assigned!.updatedAt;
    const sameProgram = programmed("deadlift", 4, 275);
    await updateProgrammedWorkoutForSession(session.id, ownerAthleteId, sameProgram);
    const once = await getAssignedWorkoutForAthlete(session.id, memberAthleteId);
    await updateProgrammedWorkoutForSession(session.id, ownerAthleteId, sameProgram);
    const twice = await getAssignedWorkoutForAthlete(session.id, memberAthleteId);
    expect(once?.updatedAt).toEqual(twice?.updatedAt);
    expect(once?.updatedAt.getTime()).toBeGreaterThanOrEqual(unchangedAt.getTime());

    await updateProgrammedWorkoutForSession(
      session.id,
      ownerAthleteId,
      programmed("back_squat", 5, 225),
    );
    await addImpedimentFor(memberAthleteId, {
      category: ImpedimentCategory.AcuteInjury,
      severity: ImpedimentSeverity.Moderate,
      affectedMuscles: [],
      affectedJoints: [Joint.Knees],
      description: "Temporary knee issue",
      startDate: "2027-01-01",
    });
    const [storedImpediment] = await db
      .select({ id: impediments.id })
      .from(impediments)
      .where(eq(impediments.athleteId, memberAthleteId))
      .limit(1);
    expect(storedImpediment).toBeDefined();
    assigned = await getAssignedWorkoutForAthlete(session.id, memberAthleteId);
    expect(assigned?.workout.movements[0].movementId).not.toBe("back_squat");
    await expect(
      overrideAssignedWorkoutForAthlete(session.id, memberAthleteId, {
        movementIndex: 0,
        movementId: "back_squat",
      }),
    ).rejects.toThrow("Movement is not available");
    await removeImpedimentFor(memberAthleteId, storedImpediment.id);
    assigned = await getAssignedWorkoutForAthlete(session.id, memberAthleteId);
    expect(assigned?.workout.movements[0].movementId).toBe("back_squat");
  });
});
