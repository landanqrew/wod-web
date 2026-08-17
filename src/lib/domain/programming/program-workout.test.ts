import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { Equipment, EQUIPMENT_PRESETS } from "../models/equipment";
import { Muscle } from "../models/body";
import { WorkoutFormat, type RxPair } from "../models/workout";
import type { Athlete } from "../models/athlete";
import { getAllMovements } from "../movements";
import {
  programWorkout,
  type ProgrammingContext,
} from "./program-workout";

describe("programWorkout", () => {
  it("cannot be called with an Athlete context", () => {
    expectTypeOf<Athlete>().not.toMatchTypeOf<ProgrammingContext>();
  });

  it("only programmes Movements available on the floor", () => {
    const workout = programWorkout(
      {
        floor: {
          availableEquipment: EQUIPMENT_PRESETS.bodyweight,
          stationCounts: { [Equipment.None]: 20 },
        },
        avoidedMuscles: new Set(),
      },
      { format: WorkoutFormat.AMRAP, movementCount: 3 },
    );

    expect(workout.movements).toHaveLength(3);
    for (const prescription of workout.movements) {
      expect(
        prescription.movement?.equipment.every(
          (equipment) => equipment === Equipment.None,
        ),
      ).toBe(true);
    }
  });

  it("treats equipment with zero declared Stations as unavailable", () => {
    const workout = programWorkout(
      {
        floor: {
          availableEquipment: new Set([Equipment.Rower]),
          stationCounts: { [Equipment.Rower]: 0 },
        },
        avoidedMuscles: new Set(),
      },
      {
        format: WorkoutFormat.AMRAP,
        movementCount: 1,
        excludeMovements: getAllMovements()
          .filter(({ id }) => id !== "row")
          .map(({ id }) => id),
      },
    );

    expect(workout.movements).toEqual([]);
  });

  it("omits Movements loading an avoided Muscle", () => {
    const workout = programWorkout(
      {
        floor: { availableEquipment: EQUIPMENT_PRESETS.fullGym },
        avoidedMuscles: new Set([Muscle.Quads]),
      },
      { format: WorkoutFormat.Chipper, movementCount: 10 },
    );

    expect(workout.movements).toHaveLength(10);
    for (const prescription of workout.movements) {
      expect([
        ...prescription.movement!.primaryMuscles,
        ...prescription.movement!.secondaryMuscles,
      ]).not.toContain(Muscle.Quads);
    }
  });

  it("writes distinct Rx Pairs only on weighted Movements", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0);

    try {
      const workout = programWorkout(
        {
          floor: { availableEquipment: EQUIPMENT_PRESETS.fullGym },
          avoidedMuscles: new Set(),
        },
        { format: WorkoutFormat.AMRAP, movementCount: 3 },
      );
      const weighted = workout.movements.filter(
        ({ movement }) => movement?.loadType === "weighted",
      );
      const unweighted = workout.movements.filter(
        ({ movement }) => movement?.loadType !== "weighted",
      );

      expect(weighted.length).toBeGreaterThan(0);
      expect(unweighted.length).toBeGreaterThan(0);
      for (const prescription of weighted) {
        expect(prescription.rxLoad).toEqual({
          male: prescription.movement?.defaultLoadMale,
          female: prescription.movement?.defaultLoadFemale,
        });
        expect(prescription.load).toBeUndefined();
      }
      for (const prescription of unweighted) {
        expect(prescription.rxLoad).toBeUndefined();
      }
      expectTypeOf<number>().not.toMatchTypeOf<RxPair>();
    } finally {
      random.mockRestore();
    }
  });
});
