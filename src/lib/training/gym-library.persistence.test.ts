import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, pool } from "../db";
import { workoutToRow } from "../db/mappers";
import {
  athletes,
  assignedWorkouts,
  gyms,
  programmedWorkouts,
  reservations,
  users,
  workoutResults,
  workouts,
} from "../db/schema";
import { getClassSessionsForGym } from "../data/gym-class";
import { getGymLibrary } from "../data/gym-library";
import { ScoreType, WorkoutFormat, type Workout } from "../domain/models/workout";
import { getBenchmark } from "../domain/generator/benchmark-library";
import { newId } from "../ids";
import { createGymForOwner } from "./gym";
import { createClassForOwner } from "./gym-class";
import { saveGymLibraryWorkout, updateGymLibraryWorkout } from "./gym-library";
import { programGymDayFromSource } from "./programmed-workout";
import { reserveClassSessionForAthlete } from "./reservation";

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
      { startDate: "2027-04-02", endDate: "2027-04-23" },
    );
    const sessions = await getClassSessionsForGym(gymId, ownerAthleteId, [classId]);

    const sourceWorkoutId = await saveGymLibraryWorkout(gymId, ownerAthleteId, template);
    await expect(
      saveGymLibraryWorkout(gymId, ownerAthleteId, getBenchmark("fran")),
    ).rejects.toThrow();
    expect(sourceWorkoutId).not.toBe(template.id);
    await expect(getGymLibrary(gymId, ownerAthleteId)).resolves.toMatchObject([
      { sourceKind: "gym", workout: { id: sourceWorkoutId, name: template.name }, lastRunAt: null, programmedRunCount: 0, results: [] },
    ]);

    await reserveClassSessionForAthlete(
      sessions[0].id,
      ownerAthleteId,
      new Date("2027-03-01T00:00:00Z"),
    );
    await reserveClassSessionForAthlete(
      sessions[1].id,
      ownerAthleteId,
      new Date("2027-03-01T00:00:00Z"),
    );
    await programGymDayFromSource(gymId, ownerAthleteId, "2027-04-02", sourceWorkoutId);
    await programGymDayFromSource(gymId, ownerAthleteId, "2027-04-09", sourceWorkoutId);
    await db.insert(workouts).values(
      workoutToRow(
        { ...getBenchmark("fran")!, id: globalBenchmarkId },
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
    await programGymDayFromSource(
      gymId,
      ownerAthleteId,
      "2027-04-23",
      sourceWorkoutId,
    );
    await expect(
      db
        .select()
        .from(programmedWorkouts)
        .where(eq(programmedWorkouts.classSessionId, sessions[2].id)),
    ).resolves.toMatchObject([
      {
        sourceWorkoutId: globalBenchmarkId,
        workout: {
          name: "Fran",
          movements: [
            expect.objectContaining({
              movementId: "thruster",
              rxLoad: { male: 95, female: 65 },
            }),
            expect.anything(),
          ],
        },
      },
    ]);
    const globalHistory = await getGymLibrary(
      gymId,
      ownerAthleteId,
      new Date("2027-04-20T00:00:00Z"),
    );
    expect(
      globalHistory.find(({ workout }) => workout.id === globalBenchmarkId),
    ).toMatchObject({
      sourceKind: "global",
      programmedRunCount: 1,
      lastRunAt: sessions[2].startsAt.toISOString(),
    });
    const reservationRows = await db
      .select({
        classSessionId: reservations.classSessionId,
        assignedWorkoutId: assignedWorkouts.id,
      })
      .from(reservations)
      .innerJoin(
        assignedWorkouts,
        eq(assignedWorkouts.reservationId, reservations.id),
      )
      .where(eq(reservations.athleteId, ownerAthleteId));
    await expect(
      db
        .select({ id: workouts.id })
        .from(workouts)
        .where(
          eq(
            workouts.id,
            reservationRows.find(
              ({ classSessionId }) => classSessionId === sessions[0].id,
            )!.assignedWorkoutId,
          ),
        ),
    ).resolves.toHaveLength(1);
    await db.insert(workoutResults).values([
      {
        id: newId("res"),
        athleteId: ownerAthleteId,
        workoutId: sourceWorkoutId,
        assignedWorkoutId: reservationRows.find(
          ({ classSessionId }) => classSessionId === sessions[0].id,
        )!.assignedWorkoutId,
        sourceWorkoutId,
        classSessionId: sessions[0].id,
        performedAt: new Date("2027-04-02T12:00:00Z"),
        scoreType: ScoreType.RoundsAndReps,
        roundsCompleted: 8,
      },
      {
        id: newId("res"),
        athleteId: ownerAthleteId,
        workoutId: sourceWorkoutId,
        assignedWorkoutId: reservationRows.find(
          ({ classSessionId }) => classSessionId === sessions[1].id,
        )!.assignedWorkoutId,
        sourceWorkoutId,
        classSessionId: sessions[1].id,
        performedAt: new Date("2027-04-09T12:00:00Z"),
        scoreType: ScoreType.RoundsAndReps,
        roundsCompleted: 9,
      },
    ]);
    const [history] = await getGymLibrary(
      gymId,
      ownerAthleteId,
      new Date("2027-04-10T00:00:00Z"),
    );
    expect(history).toMatchObject({ programmedRunCount: 2, results: [{ roundsCompleted: 9 }, { roundsCompleted: 8 }] });
    expect(history.lastRunAt).toBe(sessions[1].startsAt.toISOString());
    const firstAssignedWorkoutId = reservationRows.find(
      ({ classSessionId }) => classSessionId === sessions[0].id,
    )!.assignedWorkoutId;
    await db
      .delete(assignedWorkouts)
      .where(eq(assignedWorkouts.id, firstAssignedWorkoutId));
    await db
      .update(programmedWorkouts)
      .set({ sourceWorkoutId: globalBenchmarkId })
      .where(eq(programmedWorkouts.classSessionId, sessions[0].id));
    const durableHistory = await getGymLibrary(
      gymId,
      ownerAthleteId,
      new Date("2027-04-10T00:00:00Z"),
    );
    expect(
      durableHistory.find(({ workout }) => workout.id === sourceWorkoutId)
        ?.results,
    ).toHaveLength(2);
    await db
      .update(programmedWorkouts)
      .set({ sourceWorkoutId })
      .where(eq(programmedWorkouts.classSessionId, sessions[0].id));

    await updateGymLibraryWorkout(gymId, ownerAthleteId, sourceWorkoutId, {
      ...template,
      name: "Friday Engine v2",
      timeCap: 15,
    });
    const programmedRows = await db
      .select()
      .from(programmedWorkouts)
      .where(eq(programmedWorkouts.sourceWorkoutId, sourceWorkoutId));
    expect(programmedRows.map(({ workout }) => workout.timeCap)).toEqual([12, 12, 12]);
    await expect(
      db
        .select({ createdBy: workouts.createdBy })
        .from(workouts)
        .where(eq(workouts.id, sourceWorkoutId)),
    ).resolves.toEqual([{ createdBy: ownerAthleteId }]);
    expect(
      (await getGymLibrary(gymId, ownerAthleteId)).find(
        ({ workout }) => workout.id === sourceWorkoutId,
      ),
    ).toMatchObject({ workout: { name: "Friday Engine v2", timeCap: 15 } });

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
