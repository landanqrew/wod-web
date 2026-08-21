import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, pool } from "../db";
import { workoutToRow } from "../db/mappers";
import {
  athletes,
  gyms,
  programmedWorkouts,
  users,
  workoutResults,
  workouts,
} from "../db/schema";
import { getClassSessionsForGym } from "../data/gym-class";
import { getGymLibrary } from "../data/gym-library";
import { ScoreType, WorkoutFormat, type Workout } from "../domain/models/workout";
import { newId } from "../ids";
import { createGymForOwner } from "./gym";
import { createClassForOwner } from "./gym-class";
import { saveGymLibraryWorkout, updateGymLibraryWorkout } from "./gym-library";
import { programGymDayFromSource } from "./programmed-workout";

const ownerUserId = newId("test_user");
const ownerAthleteId = newId("test_ath");
const outsiderUserId = newId("test_user");
const outsiderAthleteId = newId("test_ath");
const gymIds: string[] = [];
const globalBenchmarkId = newId("wod");

const template: Workout = {
  id: "client_template_id",
  name: "Friday Engine",
  format: WorkoutFormat.AMRAP,
  movements: [{ movementId: "air_squat", reps: 15 }],
  timeCap: 12,
  scoreType: ScoreType.RoundsAndReps,
  isBenchmark: false,
};

beforeAll(async () => {
  await db.insert(users).values([
    { id: ownerUserId, name: "Owner", email: `${ownerUserId}@test.local` },
    { id: outsiderUserId, name: "Outsider", email: `${outsiderUserId}@test.local` },
  ]);
  await db.insert(athletes).values([
    { id: ownerAthleteId, userId: ownerUserId, name: "Owner", sex: "male", equipment: [] },
    { id: outsiderAthleteId, userId: outsiderUserId, name: "Outsider", sex: "female", equipment: [] },
  ]);
});

afterAll(async () => {
  for (const gymId of gymIds) await db.delete(gyms).where(eq(gyms.id, gymId));
  await db.delete(workouts).where(eq(workouts.id, globalBenchmarkId));
  await db.delete(users).where(eq(users.id, ownerUserId));
  await db.delete(users).where(eq(users.id, outsiderUserId));
  await pool.end();
});

describe("Gym workout library", () => {
  it("owns reusable sources, preserves embedded history, and isolates Gyms", async () => {
    const gymId = await createGymForOwner(ownerAthleteId, {
      name: "Lineage Gym",
      floor: [],
    });
    gymIds.push(gymId);
    const outsiderGymId = await createGymForOwner(outsiderAthleteId, {
      name: "Other Gym",
      floor: [],
    });
    gymIds.push(outsiderGymId);
    const classId = await createClassForOwner(
      gymId,
      ownerAthleteId,
      {
        name: "Friday",
        coachAthleteId: ownerAthleteId,
        weeklyTimes: [{ dayOfWeek: 5, localTime: "06:00" }],
        timeZone: "America/Chicago",
        capacity: 20,
      },
      { startDate: "2027-04-02", endDate: "2027-04-16" },
    );
    const sessions = await getClassSessionsForGym(gymId, ownerAthleteId, [classId]);

    const sourceWorkoutId = await saveGymLibraryWorkout(gymId, ownerAthleteId, template);
    expect(sourceWorkoutId).not.toBe(template.id);
    await expect(getGymLibrary(gymId, ownerAthleteId)).resolves.toMatchObject([
      { workout: { id: sourceWorkoutId, name: template.name }, lastRunAt: null, programmedRunCount: 0, results: [] },
    ]);

    await programGymDayFromSource(gymId, ownerAthleteId, "2027-04-02", sourceWorkoutId);
    await programGymDayFromSource(gymId, ownerAthleteId, "2027-04-09", sourceWorkoutId);
    await db.insert(workouts).values(
      workoutToRow(
        { ...template, id: globalBenchmarkId, name: "Global Test", isBenchmark: true },
        null,
        "girl",
      ),
    );
    await programGymDayFromSource(
      gymId,
      ownerAthleteId,
      "2027-04-16",
      globalBenchmarkId,
    );
    await expect(
      db
        .select()
        .from(programmedWorkouts)
        .where(eq(programmedWorkouts.classSessionId, sessions[2].id)),
    ).resolves.toMatchObject([
      { sourceWorkoutId: globalBenchmarkId, workout: { name: "Global Test" } },
    ]);
    await db.insert(workoutResults).values([
      {
        id: newId("res"),
        athleteId: ownerAthleteId,
        workoutId: sourceWorkoutId,
        performedAt: new Date("2027-04-02T12:00:00Z"),
        scoreType: ScoreType.RoundsAndReps,
        roundsCompleted: 8,
      },
      {
        id: newId("res"),
        athleteId: ownerAthleteId,
        workoutId: sourceWorkoutId,
        performedAt: new Date("2027-04-09T12:00:00Z"),
        scoreType: ScoreType.RoundsAndReps,
        roundsCompleted: 9,
      },
    ]);
    const [history] = await getGymLibrary(gymId, ownerAthleteId);
    expect(history).toMatchObject({ programmedRunCount: 2, results: [{ roundsCompleted: 9 }, { roundsCompleted: 8 }] });
    expect(history.lastRunAt).toBe(sessions[1].startsAt.toISOString());

    await updateGymLibraryWorkout(gymId, ownerAthleteId, sourceWorkoutId, {
      ...template,
      name: "Friday Engine v2",
      timeCap: 15,
    });
    const programmedRows = await db
      .select()
      .from(programmedWorkouts)
      .where(eq(programmedWorkouts.sourceWorkoutId, sourceWorkoutId));
    expect(programmedRows.map(({ workout }) => workout.timeCap)).toEqual([12, 12]);
    await expect(getGymLibrary(gymId, ownerAthleteId)).resolves.toMatchObject([
      { workout: { name: "Friday Engine v2", timeCap: 15 } },
    ]);

    await expect(getGymLibrary(gymId, outsiderAthleteId)).rejects.toThrow("Gym not found");
    await expect(
      updateGymLibraryWorkout(outsiderGymId, outsiderAthleteId, sourceWorkoutId, template),
    ).rejects.toThrow("Workout not found");
    await expect(
      programGymDayFromSource(outsiderGymId, outsiderAthleteId, "2027-04-02", sourceWorkoutId),
    ).rejects.toThrow("Source Workout not found");
    expect(await db.select().from(workouts).where(eq(workouts.id, sourceWorkoutId))).toHaveLength(1);
  });
});
