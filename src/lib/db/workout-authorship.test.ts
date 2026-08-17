import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, pool } from "./index";
import { athletes, users, workoutResults, workouts } from "./schema";
import { newId } from "../ids";
import { ScoreType, WorkoutFormat, type Workout } from "../domain/models/workout";
import { logResultForAthlete, upsertWorkout } from "../training/log";

const authorUserId = newId("test_user");
const authorAthleteId = newId("test_ath");
const performerUserId = newId("test_user");
const performerAthleteId = newId("test_ath");
const workoutId = newId("wod");

const workout: Workout = {
  id: workoutId,
  name: "Shared authored workout",
  format: WorkoutFormat.AMRAP,
  movements: [{ movementId: "air_squat", reps: 10 }],
  scoreType: ScoreType.RoundsAndReps,
  isBenchmark: false,
};

beforeAll(async () => {
  await db.insert(users).values([
    {
      id: authorUserId,
      name: "Workout Author",
      email: `${authorUserId}@test.local`,
    },
    {
      id: performerUserId,
      name: "Workout Performer",
      email: `${performerUserId}@test.local`,
    },
  ]);
  await db.insert(athletes).values([
    {
      id: authorAthleteId,
      userId: authorUserId,
      name: "Workout Author",
      sex: "female",
      equipment: [],
    },
    {
      id: performerAthleteId,
      userId: performerUserId,
      name: "Workout Performer",
      sex: "male",
      equipment: [],
    },
  ]);
});

afterAll(async () => {
  await db.delete(workouts).where(eq(workouts.id, workoutId));
  await db.delete(users).where(eq(users.id, authorUserId));
  await db.delete(users).where(eq(users.id, performerUserId));
  await pool.end();
});

describe("workout authorship deletion", () => {
  it("preserves another Athlete's result and clears attribution", async () => {
    await upsertWorkout(workout, authorAthleteId);
    const { result } = await logResultForAthlete(performerAthleteId, {
      workoutId,
      performedAt: new Date().toISOString(),
      scoreType: ScoreType.RoundsAndReps,
      roundsCompleted: 5,
      partialReps: 3,
      rx: true,
      movementResults: [],
    });

    await db.delete(athletes).where(eq(athletes.id, authorAthleteId));

    const [storedWorkout] = await db
      .select({ id: workouts.id, createdBy: workouts.createdBy })
      .from(workouts)
      .where(eq(workouts.id, workoutId));
    const [storedResult] = await db
      .select({ id: workoutResults.id, workoutId: workoutResults.workoutId })
      .from(workoutResults)
      .where(eq(workoutResults.id, result.id));

    expect(storedWorkout).toEqual({ id: workoutId, createdBy: null });
    expect(storedResult).toEqual({ id: result.id, workoutId });
  });
});
