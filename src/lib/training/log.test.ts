import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, pool } from "@/lib/db";
import { athletes, users } from "@/lib/db/schema";
import { getPRs, getResults, getWorkoutsForResults } from "@/lib/data/training";
import { logResultForAthlete, upsertWorkout } from "./log";
import { newId } from "@/lib/ids";
import { ScoreType, WorkoutFormat } from "@/lib/domain/models/workout";
import type { Workout } from "@/lib/domain/models/workout";
import { generateWorkout } from "@/lib/domain/generator/workout-generator";
import { Sex } from "@/lib/domain/models/athlete";
import { EQUIPMENT_PRESETS } from "@/lib/domain/models/equipment";
import { BiasDetector } from "@/lib/domain/tracking/bias-detector";
import { VolumeTracker } from "@/lib/domain/tracking/volume-tracker";

/*
  Hits the real Postgres from `docker compose up`. Covers the write path the UI
  drives: generate → persist → log → detect PRs → read it back on history and
  the analyzers. Everything it creates is torn down afterwards.
*/

const userId = newId("test_user");
const athleteId = newId("test_ath");

const athlete = {
  id: athleteId,
  name: "Integration Athlete",
  sex: Sex.Male,
  equipment: EQUIPMENT_PRESETS.fullGym,
  impediments: [],
};

let generated: Workout;

beforeAll(async () => {
  await db.insert(users).values({
    id: userId,
    name: "Integration",
    email: `${userId}@test.local`,
  });
  await db.insert(athletes).values({
    id: athleteId,
    userId,
    name: athlete.name,
    sex: athlete.sex,
    equipment: [...athlete.equipment],
    preferredDuration: 60,
  });

  generated = generateWorkout(athlete, {
    format: WorkoutFormat.AMRAP,
    movementCount: 3,
    timeCap: 12,
  });
});

afterAll(async () => {
  // Cascades clear the athlete, workouts, results and PRs.
  await db.delete(users).where(eq(users.id, userId));
  await pool.end();
});

describe("log flow against Postgres", () => {
  it("persists a generated workout, logs a result, and detects the first PR", async () => {
    const { result, prs } = await logResultForAthlete(athleteId, {
      workout: {
        ...generated,
        movements: generated.movements.map(({ movement: _m, ...rest }) => rest),
      },
      workoutId: generated.id,
      performedAt: new Date().toISOString(),
      scoreType: generated.scoreType,
      roundsCompleted: 9,
      partialReps: 12,
      rpe: 8,
      rx: true,
      movementResults: generated.movements.map((m) => ({
        movementId: m.movementId,
        reps: m.reps,
        load: m.load,
        rx: true,
      })),
      notes: "integration test",
    });

    expect(result.id).toMatch(/^res_/);
    expect(prs.some((p) => p.referenceType === "workout" && p.value === 9012)).toBe(true);

    const stored = await getResults(athleteId);
    expect(stored).toHaveLength(1);
    expect(stored[0].roundsCompleted).toBe(9);
    expect(stored[0].rpe).toBe(8);
    expect(stored[0].notes).toBe("integration test");
  });

  it("does not re-award a PR for a worse score, and does for a better one", async () => {
    const worse = await logResultForAthlete(athleteId, {
      workoutId: generated.id,
      performedAt: new Date().toISOString(),
      scoreType: ScoreType.RoundsAndReps,
      roundsCompleted: 8,
      partialReps: 0,
      rx: true,
      movementResults: [],
    });
    expect(worse.prs).toHaveLength(0);

    const better = await logResultForAthlete(athleteId, {
      workoutId: generated.id,
      performedAt: new Date().toISOString(),
      scoreType: ScoreType.RoundsAndReps,
      roundsCompleted: 11,
      partialReps: 3,
      rx: true,
      movementResults: [],
    });
    expect(better.prs).toHaveLength(1);
    expect(better.prs[0].value).toBe(11003);
    expect(better.prs[0].previousValue).toBe(9012);

    const prs = await getPRs(athleteId);
    expect(prs.some((p) => p.value === 11003)).toBe(true);
  });

  it("rejects a result whose workout does not exist", async () => {
    await expect(
      logResultForAthlete(athleteId, {
        workoutId: "wod_does_not_exist",
        performedAt: new Date().toISOString(),
        scoreType: ScoreType.Time,
        timeSeconds: 300,
        rx: true,
        movementResults: [],
      })
    ).rejects.toThrow(/Unknown workout/);
  });

  it("rejects invalid input at the boundary", async () => {
    await expect(
      logResultForAthlete(athleteId, {
        workoutId: generated.id,
        performedAt: new Date().toISOString(),
        scoreType: "nonsense",
        rx: true,
        movementResults: [],
      })
    ).rejects.toThrow();
  });

  it("feeds the analyzers the results it stored", async () => {
    const strength: Workout = {
      id: newId("wod"),
      name: "Integration Squat",
      format: WorkoutFormat.Strength,
      movements: [{ movementId: "back_squat", reps: 5, load: 315 }],
      scoreType: ScoreType.Load,
      isBenchmark: false,
    };
    await upsertWorkout(strength, athleteId);

    await logResultForAthlete(athleteId, {
      workoutId: strength.id,
      performedAt: new Date().toISOString(),
      scoreType: ScoreType.Load,
      peakLoad: 315,
      rpe: 9,
      rx: true,
      movementResults: [{ movementId: "back_squat", reps: 5, load: 315, rx: true }],
    });

    const results = await getResults(athleteId);
    const workouts = await getWorkoutsForResults(results);

    const volume = new VolumeTracker(results).monthSummary();
    expect(volume.totalWorkouts).toBe(results.length);
    expect(volume.totalVolumeLbs).toBeGreaterThanOrEqual(315 * 5);

    const bias = new BiasDetector(results, workouts).analyze(30);
    expect(bias.totalWorkouts).toBe(results.length);
    expect(bias.formatDistribution.strength).toBeGreaterThan(0);
  });
});
