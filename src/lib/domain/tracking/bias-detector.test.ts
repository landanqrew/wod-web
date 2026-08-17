import { describe, it, expect, beforeEach } from "vitest";
import { BiasDetector } from "./bias-detector";
import type { Workout } from "../models/workout";
import { WorkoutFormat } from "../models/workout";
import type { WorkoutResult } from "../models/workout-result";
import { ScoreType } from "../models/workout";

function makeResult(overrides: Partial<WorkoutResult> = {}): WorkoutResult {
  return {
    id: `result_${Math.random().toString(36).slice(2, 8)}`,
    athleteId: "athlete_1",
    workoutId: "wod_1",
    performedAt: "2026-02-10T10:00:00Z",
    scoreType: ScoreType.RoundsAndReps,
    rx: true,
    movementResults: [],
    ...overrides,
  };
}

function makeWorkout(
  id: string,
  format: WorkoutFormat,
  scoreType = ScoreType.RoundsAndReps
): Workout {
  return {
    id,
    name: `WOD ${id}`,
    format,
    movements: [],
    scoreType,
    isBenchmark: false,
  };
}

describe("BiasDetector", () => {
  let results: WorkoutResult[];
  let detector: BiasDetector;

  beforeEach(() => {
    results = [];
    detector = new BiasDetector(results, [
      makeWorkout("wod_1", WorkoutFormat.AMRAP),
      makeWorkout("wod_2", WorkoutFormat.ForTime, ScoreType.Time),
      makeWorkout("wod_3", WorkoutFormat.EMOM),
    ]);
  });

  it("returns empty insights when no data", () => {
    const report = detector.analyze(30);
    expect(report.totalWorkouts).toBe(0);
    expect(report.insights).toHaveLength(0);
  });

  it("returns info insight when too few workouts for analysis", () => {
    results.push(
      makeResult({
        performedAt: new Date().toISOString(),
        movementResults: [
          { movementId: "back_squat", load: 225, reps: 10, rx: true },
        ],
      })
    );

    const report = detector.analyze(30);
    expect(report.totalWorkouts).toBe(1);
    expect(report.insights.length).toBeGreaterThanOrEqual(1);
    expect(report.insights[0].severity).toBe("info");
  });

  it("detects missing modalities", () => {
    // All weightlifting, no gymnastics or monostructural
    for (let i = 0; i < 5; i++) {
      results.push(
        makeResult({
          id: `r_${i}`,
          performedAt: new Date().toISOString(),
          movementResults: [
            { movementId: "back_squat", load: 225, reps: 10, rx: true },
            { movementId: "deadlift", load: 315, reps: 5, rx: true },
          ],
        })
      );
    }

    const report = detector.analyze(30);
    const modalityInsights = report.insights.filter(
      (i) => i.category === "modality"
    );
    // Should flag missing gymnastics, monostructural, strongman
    expect(modalityInsights.length).toBeGreaterThanOrEqual(2);
  });

  it("detects missing Movement Patterns", () => {
    // All squat/push, no pull or hinge
    for (let i = 0; i < 5; i++) {
      results.push(
        makeResult({
          id: `r_${i}`,
          performedAt: new Date().toISOString(),
          movementResults: [
            { movementId: "air_squat", reps: 20, rx: true },
            { movementId: "push_up", reps: 15, rx: true },
          ],
        })
      );
    }

    const report = detector.analyze(30);
    const patternInsights = report.insights.filter(
      (i) => i.category === "movement_pattern"
    );
    expect(patternInsights.length).toBeGreaterThanOrEqual(1);
  });

  it("reports Muscle distribution separately from Movement Pattern balance", () => {
    results.push(
      makeResult({
        performedAt: new Date().toISOString(),
        movementResults: [
          { movementId: "back_squat", load: 225, reps: 10, rx: true },
        ],
      })
    );

    const report = detector.analyze(30);

    expect(report.muscleDistribution.quads).toBeGreaterThan(0);
    expect(report.muscleDistribution.glutes).toBeGreaterThan(0);
    expect(report.movementPatternDistribution.squat).toBe(100);
  });

  it("computes modality distribution percentages", () => {
    for (let i = 0; i < 3; i++) {
      results.push(
        makeResult({
          id: `r_${i}`,
          performedAt: new Date().toISOString(),
          movementResults: [
            { movementId: "back_squat", load: 225, reps: 10, rx: true },
            { movementId: "pull_up", reps: 15, rx: true },
            { movementId: "run", reps: 1, rx: true },
          ],
        })
      );
    }

    const report = detector.analyze(30);
    expect(report.modalityDistribution.weightlifting).toBeGreaterThan(0);
    expect(report.modalityDistribution.gymnastics).toBeGreaterThan(0);
    expect(report.modalityDistribution.monostructural).toBeGreaterThan(0);
  });

  it("computes movement frequency sorted by count", () => {
    for (let i = 0; i < 4; i++) {
      results.push(
        makeResult({
          id: `r_${i}`,
          performedAt: new Date().toISOString(),
          movementResults: [
            { movementId: "back_squat", load: 225, reps: 10, rx: true },
            ...(i < 2
              ? [{ movementId: "pull_up", reps: 10, rx: true as const }]
              : []),
          ],
        })
      );
    }

    const report = detector.analyze(30);
    expect(report.movementFrequency[0].movementId).toBe("back_squat");
    expect(report.movementFrequency[0].count).toBe(4);
  });

  it("detects low training frequency", () => {
    // 1 workout in 14 days
    results.push(
      makeResult({
        performedAt: new Date().toISOString(),
        movementResults: [
          { movementId: "air_squat", reps: 20, rx: true },
          { movementId: "push_up", reps: 15, rx: true },
          { movementId: "pull_up", reps: 10, rx: true },
        ],
      })
    );
    results.push(
      makeResult({
        id: "r2",
        performedAt: new Date(Date.now() - 5 * 86400000).toISOString(),
        movementResults: [
          { movementId: "air_squat", reps: 20, rx: true },
          { movementId: "push_up", reps: 15, rx: true },
          { movementId: "pull_up", reps: 10, rx: true },
        ],
      })
    );
    results.push(
      makeResult({
        id: "r3",
        performedAt: new Date(Date.now() - 10 * 86400000).toISOString(),
        movementResults: [
          { movementId: "air_squat", reps: 20, rx: true },
          { movementId: "push_up", reps: 15, rx: true },
          { movementId: "pull_up", reps: 10, rx: true },
        ],
      })
    );

    const report = detector.analyze(14);
    const freqInsights = report.insights.filter(
      (i) => i.category === "frequency"
    );
    expect(freqInsights.length).toBeGreaterThanOrEqual(1);
  });

  it("detects format bias when one format dominates", () => {
    for (let i = 0; i < 6; i++) {
      results.push(
        makeResult({
          id: `r_${i}`,
          workoutId: "wod_1", // all amrap
          performedAt: new Date(Date.now() - i * 86400000).toISOString(),
          movementResults: [
            { movementId: "air_squat", reps: 20, rx: true },
            { movementId: "push_up", reps: 15, rx: true },
            { movementId: "pull_up", reps: 10, rx: true },
          ],
        })
      );
    }

    const report = detector.analyze(30);
    const formatInsights = report.insights.filter(
      (i) => i.category === "format"
    );
    expect(formatInsights.length).toBeGreaterThanOrEqual(1);
  });
});
