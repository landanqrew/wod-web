import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, pool } from "../db";
import { athletes, gyms, users, workouts } from "../db/schema";
import { getGymForAthlete, getGymsForAthlete } from "../data/gym";
import { Equipment } from "../domain/models/equipment";
import { ScoreType, WorkoutFormat, type Workout } from "../domain/models/workout";
import { newId } from "../ids";
import { logResultForAthlete, upsertWorkout } from "./log";
import { createGymForOwner, updateGymForOwner } from "./gym";

const userId = newId("test_user");
const athleteId = newId("test_ath");
const workoutId = newId("wod");
let gymId: string | undefined;

beforeAll(async () => {
  await db.insert(users).values({
    id: userId,
    name: "Gym Owner",
    email: `${userId}@test.local`,
  });
  await db.insert(athletes).values({
    id: athleteId,
    userId,
    name: "Gym Owner",
    sex: "female",
    equipment: [Equipment.Dumbbell],
  });
});

afterAll(async () => {
  if (gymId) await db.delete(gyms).where(eq(gyms.id, gymId));
  await db.delete(workouts).where(eq(workouts.id, workoutId));
  await db.delete(users).where(eq(users.id, userId));
  await pool.end();
});

describe("Gym floor persistence", () => {
  it("creates an owned Gym, edits its floor, and preserves solo training", async () => {
    const soloWorkout: Workout = {
      id: workoutId,
      name: "Solo workout",
      format: WorkoutFormat.AMRAP,
      movements: [{ movementId: "air_squat", reps: 10 }],
      scoreType: ScoreType.RoundsAndReps,
      isBenchmark: false,
    };
    await upsertWorkout(soloWorkout, athleteId);
    const { result } = await logResultForAthlete(athleteId, {
      workoutId,
      performedAt: new Date().toISOString(),
      scoreType: ScoreType.RoundsAndReps,
      roundsCompleted: 5,
      rx: true,
      movementResults: [],
    });

    gymId = await createGymForOwner(athleteId, {
      name: "Iron Ridge",
      floor: [
        { equipment: Equipment.Rower, stationCount: 12 },
        { equipment: Equipment.Barbell },
      ],
    });

    expect(await getGymsForAthlete(athleteId)).toEqual([
      {
        id: gymId,
        name: "Iron Ridge",
        ownerAthleteId: athleteId,
        floor: expect.arrayContaining([
          { equipment: Equipment.Rower, stationCount: 12 },
          { equipment: Equipment.Barbell },
        ]),
      },
    ]);

    await updateGymForOwner(gymId, athleteId, {
      name: "Iron Ridge CrossFit",
      floor: [{ equipment: Equipment.Rower, stationCount: 10 }],
    });
    expect(await getGymForAthlete(gymId, athleteId)).toEqual({
      id: gymId,
      name: "Iron Ridge CrossFit",
      ownerAthleteId: athleteId,
      floor: [{ equipment: Equipment.Rower, stationCount: 10 }],
    });

    const [storedResult] = await db.query.workoutResults.findMany({
      where: (rows, { eq: equals }) => equals(rows.id, result.id),
    });
    expect(storedResult?.workoutId).toBe(workoutId);
  });
});
