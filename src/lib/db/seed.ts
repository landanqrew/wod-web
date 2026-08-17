import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, pool } from "./index";
import {
  athletes,
  impediments,
  personalRecords,
  users,
  workoutResults,
  workouts,
} from "./schema";
import { prToRow, resultToRow, workoutToRow } from "./mappers";
import { auth } from "@/lib/auth";
import { newId } from "@/lib/ids";
import { BENCHMARK_LIBRARY } from "@/lib/domain/generator/benchmark-library";
import { generateWorkout } from "@/lib/domain/generator/workout-generator";
import { PRTracker } from "@/lib/domain/tracking/pr-tracker";
import { Sex } from "@/lib/domain/models/athlete";
import type { Athlete } from "@/lib/domain/models/athlete";
import { EQUIPMENT_PRESETS } from "@/lib/domain/models/equipment";
import { ScoreType, WorkoutFormat } from "@/lib/domain/models/workout";
import type { Workout } from "@/lib/domain/models/workout";
import type { PersonalRecord, WorkoutResult } from "@/lib/domain/models/workout-result";
import { DifficultyTier } from "@/lib/domain/models/movement";

const DEMO_EMAIL = "demo@wod.app";
const DEMO_PASSWORD = "demo12345";

/** Benchmarks are shared reference data — every install gets them. */
async function seedBenchmarks() {
  for (const benchmark of BENCHMARK_LIBRARY) {
    await db
      .insert(workouts)
      .values(workoutToRow(benchmark, null, benchmark.category))
      .onConflictDoNothing({ target: workouts.id });
  }
  console.log(`seeded ${BENCHMARK_LIBRARY.length} benchmark workouts`);
}

async function demoUserId(): Promise<string> {
  const [existing] = await db.select().from(users).where(eq(users.email, DEMO_EMAIL)).limit(1);
  if (existing) return existing.id;

  await auth.api.signUpEmail({
    body: { name: "Demo Athlete", email: DEMO_EMAIL, password: DEMO_PASSWORD },
  });
  const [created] = await db.select().from(users).where(eq(users.email, DEMO_EMAIL)).limit(1);
  if (!created) throw new Error("could not create the demo user");
  return created.id;
}

function daysAgo(days: number, hour = 7): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, 0, 0, 0);
  return d;
}

/** Deterministic jitter so reruns produce the same-looking history. */
function wobble(seed: number, spread: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return (x - Math.floor(x) - 0.5) * 2 * spread;
}

async function seedDemoAthlete() {
  const userId = await demoUserId();

  const [existingAthlete] = await db
    .select()
    .from(athletes)
    .where(eq(athletes.userId, userId))
    .limit(1);
  if (existingAthlete) {
    console.log("demo athlete already seeded — nothing to do");
    return;
  }

  const athleteId = newId("ath");
  await db.insert(athletes).values({
    id: athleteId,
    userId,
    name: "Demo Athlete",
    sex: Sex.Male,
    equipment: [...EQUIPMENT_PRESETS.fullGym],
    preferredDuration: 60,
    notes: "Seeded profile with eight weeks of training history.",
  });

  const athlete: Athlete = {
    id: athleteId,
    name: "Demo Athlete",
    sex: Sex.Male,
    equipment: EQUIPMENT_PRESETS.fullGym,
    impediments: [],
    preferredDuration: 60,
  };

  // A realistic rotation: benchmarks for retests, generated metcons, strength days.
  const benchmarks = ["fran", "cindy", "grace", "helen", "diane"]
    .map((id) => BENCHMARK_LIBRARY.find((b) => b.id === `benchmark_${id}`))
    .filter((b): b is (typeof BENCHMARK_LIBRARY)[number] => Boolean(b));

  const generated: Workout[] = [
    generateWorkout(athlete, { format: WorkoutFormat.AMRAP, movementCount: 3, timeCap: 15 }),
    generateWorkout(athlete, { format: WorkoutFormat.ForTime, movementCount: 3, timeCap: 18 }),
    generateWorkout(athlete, { format: WorkoutFormat.EMOM, movementCount: 3, emomMinutes: 16 }),
    generateWorkout(athlete, { format: WorkoutFormat.Chipper, movementCount: 5, timeCap: 25 }),
  ];

  const strengthDay: Workout = {
    id: newId("wod"),
    name: "Back Squat 5x5",
    format: WorkoutFormat.Strength,
    movements: [{ movementId: "back_squat", reps: 5, load: 275, notes: "5x5 across" }],
    rounds: 5,
    scoreType: ScoreType.Load,
    isBenchmark: false,
    estimatedDuration: 25,
  };
  const deadliftDay: Workout = {
    id: newId("wod"),
    name: "Deadlift 5/3/1 — Week 3",
    format: WorkoutFormat.Strength,
    movements: [{ movementId: "deadlift", reps: 1, load: 385, notes: "Top single, then AMRAP" }],
    rounds: 3,
    scoreType: ScoreType.Load,
    isBenchmark: false,
    estimatedDuration: 30,
  };

  for (const workout of [...generated, strengthDay, deadliftDay]) {
    await db
      .insert(workouts)
      .values(workoutToRow(workout, athleteId))
      .onConflictDoNothing({ target: workouts.id });
  }

  // Four sessions a week for eight weeks, oldest first so PRs accumulate properly.
  const rotation: Workout[] = [
    generated[0],
    strengthDay,
    benchmarks[0] ?? generated[1],
    generated[1],
    deadliftDay,
    benchmarks[1] ?? generated[2],
    generated[2],
    benchmarks[3] ?? generated[3],
    generated[3],
    benchmarks[2] ?? generated[0],
    strengthDay,
    benchmarks[4] ?? generated[1],
  ];

  const results: WorkoutResult[] = [];
  const trainingDays = [0, 1, 3, 5]; // Mon/Tue/Thu/Sat-ish
  let index = 0;

  for (let week = 7; week >= 0; week--) {
    for (const offset of trainingDays) {
      const workout = rotation[index % rotation.length];
      const progress = (7 - week) / 7; // 0 → 1 across the block
      const date = daysAgo(week * 7 + (6 - offset));
      const scaled = index % 9 === 4;

      const result: WorkoutResult = {
        id: newId("res"),
        athleteId,
        workoutId: workout.id,
        performedAt: date.toISOString(),
        scoreType: workout.scoreType,
        rx: !scaled,
        scalingTier: scaled ? DifficultyTier.Intermediate : undefined,
        rpe: Math.min(10, Math.max(5, Math.round((6.5 + progress * 1.5 + wobble(index, 0.8)) * 2) / 2)),
        movementResults: workout.movements.map((m) => ({
          movementId: m.movementId,
          reps: m.reps,
          load: m.load
            ? Math.round((m.load * (0.85 + progress * 0.25) + wobble(index + 3, 5)) / 5) * 5
            : undefined,
          rx: !scaled,
        })),
        notes: index % 5 === 0 ? "Felt strong — grip was the limiter." : undefined,
      };

      switch (workout.scoreType) {
        case ScoreType.Time: {
          const base = (workout.estimatedDuration ?? 12) * 60;
          result.timeSeconds = Math.round(base * (1.18 - progress * 0.22) + wobble(index, 12));
          break;
        }
        case ScoreType.RoundsAndReps:
          result.roundsCompleted = Math.max(3, Math.round(9 + progress * 4 + wobble(index, 1.5)));
          result.partialReps = Math.abs(Math.round(wobble(index + 7, 9)));
          break;
        case ScoreType.Load:
          result.peakLoad =
            Math.round(
              ((workout.movements[0]?.load ?? 225) * (0.85 + progress * 0.25) + wobble(index, 8)) / 5
            ) * 5;
          break;
        case ScoreType.Reps:
          result.totalReps = Math.round(120 + progress * 40 + wobble(index, 12));
          break;
        default:
          break;
      }

      results.push(result);
      index++;
    }
  }

  await db.insert(workoutResults).values(results.map(resultToRow));

  // Replay PR detection in chronological order, exactly like the log action does.
  const saved: PersonalRecord[] = [];
  const tracker = new PRTracker(saved);
  for (const result of results) {
    saved.push(...tracker.detectPRs(result));
  }
  if (saved.length > 0) await db.insert(personalRecords).values(saved.map(prToRow));

  // One active impediment so the constraint engine is visible on first launch.
  await db.insert(impediments).values({
    id: newId("imp"),
    athleteId,
    category: "acute_injury",
    severity: "mild",
    affectedMuscles: ["shoulders"],
    affectedJoints: [],
    description: "Left shoulder — mild AC joint irritation, cleared for most work",
    startDate: daysAgo(10).toISOString().slice(0, 10),
    constraints: {
      avoidMuscles: [],
      avoidJoints: [],
      avoidTags: ["max_effort"],
      allowHighImpact: true,
      allowOverhead: true,
      allowInversion: true,
      allowProne: true,
      allowKipping: true,
      allowHeavyAxialLoad: true,
      maxLoadPercent: 80,
      notes: "Mild issue in shoulders. Reduce load, monitor pain. Stop if pain increases.",
    },
  });

  console.log(
    `seeded demo athlete: ${results.length} results, ${saved.length} PRs — sign in as ${DEMO_EMAIL} / ${DEMO_PASSWORD}`
  );
}

async function main() {
  await seedBenchmarks();
  await seedDemoAthlete();
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
