import { describe, it, expect } from "vitest";
import { generateWorkout } from "./generator/workout-generator";
import { PRTracker } from "./tracking/pr-tracker";
import { getMovement, getAllMovements } from "./movements/library";
import { filterAllowedMovements, mergeConstraints } from "./scaling/constraint-engine";
import { Sex } from "./models/athlete";
import type { Athlete } from "./models/athlete";
import { EQUIPMENT_PRESETS, Equipment } from "./models/equipment";
import { ScoreType, WorkoutFormat } from "./models/workout";
import type { WorkoutResult, PersonalRecord } from "./models/workout-result";
import {
  ImpedimentCategory,
  ImpedimentSeverity,
  buildInjuryConstraints,
  buildPregnancyConstraints,
} from "./models/impediment";
import { BodyRegion } from "./models/body";

/*
  These cover the two paths the web app leans on hardest: the generator honoring
  an athlete's stored impediments, and PR detection replayed against the PR list
  the log action loads from Postgres.
*/

function athleteWith(impediments: Athlete["impediments"] = []): Athlete {
  return {
    id: "ath_test",
    name: "Test",
    sex: Sex.Male,
    equipment: EQUIPMENT_PRESETS.fullGym,
    impediments,
  };
}

describe("generator constraint filtering", () => {
  it("never programs inverted or high-impact work in the third trimester", () => {
    const athlete = athleteWith([
      {
        id: "imp_1",
        category: ImpedimentCategory.Pregnancy,
        severity: ImpedimentSeverity.Moderate,
        affectedRegions: [],
        description: "Third trimester",
        startDate: "2026-01-01",
        trimester: 3,
        constraints: buildPregnancyConstraints(3),
      },
    ]);

    for (const format of [WorkoutFormat.AMRAP, WorkoutFormat.ForTime, WorkoutFormat.Chipper]) {
      for (let i = 0; i < 15; i++) {
        const workout = generateWorkout(athlete, { format, movementCount: 4 });
        for (const p of workout.movements) {
          const movement = getMovement(p.movementId)!;
          expect(movement.tags).not.toContain("inverted");
          expect(movement.tags).not.toContain("high_impact");
          expect(movement.tags).not.toContain("max_effort");
          expect(movement.primaryRegions).not.toContain(BodyRegion.Core);
        }
      }
    }
  });

  it("excludes shoulder-loading movements for a severe shoulder injury", () => {
    const constraints = buildInjuryConstraints(
      [BodyRegion.Shoulders],
      ImpedimentSeverity.Severe
    );
    const allowed = filterAllowedMovements(
      getAllMovements(),
      constraints,
      EQUIPMENT_PRESETS.fullGym
    );

    expect(allowed.length).toBeGreaterThan(0);
    for (const movement of allowed) {
      expect(movement.primaryRegions).not.toContain(BodyRegion.Shoulders);
      expect(movement.tags).not.toContain("overhead");
    }
  });

  it("only programs movements the athlete's equipment supports", () => {
    const athlete: Athlete = {
      ...athleteWith(),
      equipment: EQUIPMENT_PRESETS.bodyweight,
    };

    const workout = generateWorkout(athlete, {
      format: WorkoutFormat.AMRAP,
      movementCount: 3,
    });

    for (const p of workout.movements) {
      const movement = getMovement(p.movementId)!;
      for (const required of movement.equipment) {
        expect(required).toBe(Equipment.None);
      }
    }
  });

  it("merges multiple impediments to the most restrictive constraint", () => {
    const merged = mergeConstraints([
      {
        id: "a",
        category: ImpedimentCategory.Rehab,
        severity: ImpedimentSeverity.Mild,
        affectedRegions: [BodyRegion.Knees],
        description: "",
        startDate: "2026-01-01",
        constraints: buildInjuryConstraints([BodyRegion.Knees], ImpedimentSeverity.Mild),
      },
      {
        id: "b",
        category: ImpedimentCategory.AcuteInjury,
        severity: ImpedimentSeverity.Moderate,
        affectedRegions: [BodyRegion.Shoulders],
        description: "",
        startDate: "2026-01-01",
        constraints: buildInjuryConstraints([BodyRegion.Shoulders], ImpedimentSeverity.Moderate),
      },
    ]);

    expect(merged).not.toBeNull();
    expect(merged!.maxLoadPercent).toBe(50); // the lower of 80 and 50
    expect(merged!.allowKipping).toBe(false); // any `false` wins
    expect(merged!.avoidRegions).toContain(BodyRegion.Shoulders);
  });
});

describe("PR detection as the log action runs it", () => {
  function result(overrides: Partial<WorkoutResult>): WorkoutResult {
    return {
      id: `res_${Math.random().toString(36).slice(2, 8)}`,
      athleteId: "ath_test",
      workoutId: "benchmark_fran",
      performedAt: "2026-03-01T10:00:00Z",
      scoreType: ScoreType.Time,
      rx: true,
      movementResults: [],
      ...overrides,
    };
  }

  it("detects the first attempt, then only genuine improvements", () => {
    const saved: PersonalRecord[] = [];
    const tracker = new PRTracker(saved);

    const first = tracker.detectPRs(result({ timeSeconds: 300 }));
    saved.push(...first);
    expect(first).toHaveLength(1);
    expect(first[0].previousValue).toBeUndefined();

    const slower = tracker.detectPRs(result({ timeSeconds: 330 }));
    expect(slower).toHaveLength(0);

    const faster = tracker.detectPRs(result({ timeSeconds: 251 }));
    saved.push(...faster);
    expect(faster).toHaveLength(1);
    expect(faster[0].value).toBe(251);
    expect(faster[0].previousValue).toBe(300);
  });

  it("tracks movement loads separately from the workout score", () => {
    const saved: PersonalRecord[] = [];
    const tracker = new PRTracker(saved);

    const prs = tracker.detectPRs(
      result({
        scoreType: ScoreType.Load,
        workoutId: "wod_strength",
        peakLoad: 405,
        movementResults: [
          { movementId: "deadlift", load: 405, reps: 1, rx: true },
          { movementId: "back_squat", load: 315, reps: 5, rx: true },
        ],
      })
    );
    saved.push(...prs);

    expect(prs.filter((p) => p.referenceType === "workout")).toHaveLength(1);
    const movementPRs = prs.filter((p) => p.referenceType === "movement");
    expect(movementPRs.map((p) => p.referenceId).sort()).toEqual(["back_squat", "deadlift"]);

    // A lighter day afterwards sets nothing new.
    expect(
      tracker.detectPRs(
        result({
          scoreType: ScoreType.Load,
          workoutId: "wod_strength",
          peakLoad: 365,
          movementResults: [{ movementId: "deadlift", load: 365, reps: 3, rx: true }],
        })
      )
    ).toHaveLength(0);
  });

  it("scores AMRAP records as rounds*1000 + partial reps", () => {
    const saved: PersonalRecord[] = [];
    const tracker = new PRTracker(saved);

    saved.push(
      ...tracker.detectPRs(
        result({ scoreType: ScoreType.RoundsAndReps, roundsCompleted: 8, partialReps: 5 })
      )
    );
    expect(saved[0].value).toBe(8005);

    const better = tracker.detectPRs(
      result({ scoreType: ScoreType.RoundsAndReps, roundsCompleted: 8, partialReps: 12 })
    );
    expect(better).toHaveLength(1);
    expect(better[0].value).toBe(8012);
  });
});
