import { describe, it, expect, vi } from "vitest";
import { generateWorkout } from "./workout-generator";
import { createAthlete, Sex } from "../models/athlete";
import { Equipment, EQUIPMENT_PRESETS } from "../models/equipment";
import { WorkoutFormat, ScoreType } from "../models/workout";
import { Joint, Modality } from "../models/body";
import {
  buildInjuryConstraints,
  buildPregnancyConstraints,
  ImpedimentCategory,
  ImpedimentSeverity,
} from "../models/impediment";
import { Muscle } from "../models/body";

describe("generateWorkout", () => {
  it("generates an AMRAP with the correct format and structure", () => {
    const athlete = createAthlete("test", "Test", Sex.Male, [
      ...EQUIPMENT_PRESETS.fullGym,
    ]);
    const workout = generateWorkout(athlete, {
      format: WorkoutFormat.AMRAP,
      movementCount: 3,
      timeCap: 12,
    });

    expect(workout.format).toBe(WorkoutFormat.AMRAP);
    expect(workout.movements).toHaveLength(3);
    expect(workout.timeCap).toBe(12);
    expect(workout.scoreType).toBe(ScoreType.RoundsAndReps);
    expect(workout.isBenchmark).toBe(false);
  });

  it("generates a ForTime workout", () => {
    const athlete = createAthlete("test", "Test", Sex.Female, [
      ...EQUIPMENT_PRESETS.fullGym,
    ]);
    const workout = generateWorkout(athlete, {
      format: WorkoutFormat.ForTime,
      movementCount: 4,
    });

    expect(workout.format).toBe(WorkoutFormat.ForTime);
    expect(workout.movements).toHaveLength(4);
    expect(workout.scoreType).toBe(ScoreType.Time);
  });

  it("generates bodyweight-only workout when no equipment", () => {
    const athlete = createAthlete("test", "Test", Sex.Male, [Equipment.None]);
    const workout = generateWorkout(athlete, {
      format: WorkoutFormat.AMRAP,
      movementCount: 3,
    });

    for (const p of workout.movements) {
      expect(
        p.movement!.equipment.every((e) => e === Equipment.None)
      ).toBe(true);
    }
  });

  it("generates workout respecting minimal equipment", () => {
    const athlete = createAthlete("test", "Test", Sex.Female, [
      ...EQUIPMENT_PRESETS.minimal,
    ]);
    const workout = generateWorkout(athlete, {
      format: WorkoutFormat.EMOM,
      movementCount: 3,
    });

    const available = EQUIPMENT_PRESETS.minimal;
    for (const p of workout.movements) {
      for (const eq of p.movement!.equipment) {
        if (eq !== Equipment.None) {
          expect(available.has(eq)).toBe(true);
        }
      }
    }
  });

  it("respects pregnancy constraints in generated workouts", () => {
    const athlete = createAthlete("test", "Test", Sex.Female, [
      ...EQUIPMENT_PRESETS.fullGym,
    ]);
    athlete.impediments = [
      {
        id: "preg",
        category: ImpedimentCategory.Pregnancy,
        severity: ImpedimentSeverity.Moderate,
        affectedMuscles: [Muscle.Core],
        affectedJoints: [],
        description: "Pregnancy T2",
        startDate: "2025-01-01",
        trimester: 2,
        constraints: buildPregnancyConstraints(2),
      },
    ];

    const workout = generateWorkout(athlete, {
      format: WorkoutFormat.AMRAP,
      movementCount: 4,
    });

    for (const p of workout.movements) {
      // No inverted, no kipping, no prone, no high impact
      expect(p.movement!.tags).not.toContain("inverted");
      expect(p.movement!.tags).not.toContain("kipping");
      expect(p.movement!.tags).not.toContain("prone");
      expect(p.movement!.tags).not.toContain("high_impact");
    }
  });

  it("scales loads for pregnancy constraints", () => {
    const athlete = createAthlete("test", "Test", Sex.Female, [
      ...EQUIPMENT_PRESETS.fullGym,
    ]);
    athlete.impediments = [
      {
        id: "preg",
        category: ImpedimentCategory.Pregnancy,
        severity: ImpedimentSeverity.Moderate,
        affectedMuscles: [Muscle.Core],
        affectedJoints: [],
        description: "Pregnancy T2",
        startDate: "2025-01-01",
        trimester: 2,
        constraints: buildPregnancyConstraints(2),
      },
    ];

    // Generate multiple times to check load scaling
    const workout = generateWorkout(athlete, {
      format: WorkoutFormat.Strength,
      movementCount: 1,
    });

    for (const p of workout.movements) {
      if (p.load && p.movement?.defaultLoadFemale) {
        // Load should be scaled to 70% of Rx
        expect(p.load).toBeLessThanOrEqual(p.movement.defaultLoadFemale);
      }
    }
  });

  it("preserves solo generation with limited equipment and an Impediment", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    const now = vi.spyOn(Date, "now").mockReturnValue(123);

    try {
      const athlete = createAthlete("test", "Test", Sex.Male, [
        ...EQUIPMENT_PRESETS.minimal,
      ]);
      const constraints = buildInjuryConstraints(
        { muscles: [], joints: [Joint.Knees] },
        ImpedimentSeverity.Moderate,
      );
      athlete.impediments = [
        {
          id: "knee-injury",
          category: ImpedimentCategory.AcuteInjury,
          severity: ImpedimentSeverity.Moderate,
          affectedMuscles: [],
          affectedJoints: [Joint.Knees],
          description: "Knee injury",
          startDate: "2026-08-17",
          constraints,
        },
      ];

      const workout = generateWorkout(athlete, {
        format: WorkoutFormat.AMRAP,
        movementCount: 2,
      });

      expect({
        id: workout.id,
        name: workout.name,
        movements: workout.movements.map(({ movementId, reps, load }) => ({
          movementId,
          reps,
          load,
        })),
      }).toEqual({
        id: "wod_123_",
        name: "AMRAP: Dumbbell Press, Push-Up",
        movements: [
          { movementId: "dumbbell_press", reps: 10, load: 25 },
          { movementId: "push_up", reps: 15, load: undefined },
        ],
      });
    } finally {
      random.mockRestore();
      now.mockRestore();
    }
  });

  it("generates a chipper with more movements", () => {
    const athlete = createAthlete("test", "Test", Sex.Male, [
      ...EQUIPMENT_PRESETS.fullGym,
    ]);
    const workout = generateWorkout(athlete, {
      format: WorkoutFormat.Chipper,
      movementCount: 6,
    });

    expect(workout.movements).toHaveLength(6);
    expect(workout.scoreType).toBe(ScoreType.Time);
  });

  it("can filter by modality", () => {
    const athlete = createAthlete("test", "Test", Sex.Male, [
      ...EQUIPMENT_PRESETS.fullGym,
    ]);
    const workout = generateWorkout(athlete, {
      format: WorkoutFormat.AMRAP,
      movementCount: 3,
      modalities: [Modality.Gymnastics],
    });

    // With enough gymnastics movements available, all should be gymnastics
    for (const p of workout.movements) {
      expect(p.movement!.modality).toBe(Modality.Gymnastics);
    }
  });

  it("excludes specified movements", () => {
    const athlete = createAthlete("test", "Test", Sex.Male, [Equipment.None]);
    const workout = generateWorkout(athlete, {
      format: WorkoutFormat.AMRAP,
      movementCount: 2,
      excludeMovements: ["air_squat", "burpee"],
    });

    for (const p of workout.movements) {
      expect(p.movementId).not.toBe("air_squat");
      expect(p.movementId).not.toBe("burpee");
    }
  });
});
