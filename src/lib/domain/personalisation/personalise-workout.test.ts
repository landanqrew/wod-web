import { describe, expect, it } from "vitest";
import { Sex } from "../models/athlete";
import { EQUIPMENT_PRESETS } from "../models/equipment";
import {
  buildInjuryConstraints,
  ImpedimentCategory,
  ImpedimentSeverity,
} from "../models/impediment";
import { Joint, Muscle } from "../models/body";
import { LoadType } from "../models/movement";
import { ScoreType, WorkoutFormat, type Workout } from "../models/workout";
import { getMovementOrThrow } from "../movements/library";
import {
  personaliseWorkout,
  UnableToPersonaliseWorkoutError,
} from "./personalise-workout";
import { createMovementPrescription } from "./prescription";

function workoutWith(movementId: string, load?: number): Workout {
  const movement = getMovementOrThrow(movementId);
  return {
    id: "workout-1",
    name: "Test workout",
    format: WorkoutFormat.AMRAP,
    movements: [{ movementId, movement, reps: 10, load }],
    scoreType: ScoreType.RoundsAndReps,
    isBenchmark: false,
  };
}

describe("personaliseWorkout", () => {
  it("substitutes a movement blocked by an Impediment and explains why", () => {
    const constraints = buildInjuryConstraints(
      { muscles: [], joints: [Joint.Knees] },
      ImpedimentSeverity.Moderate,
    );

    const result = personaliseWorkout(workoutWith("back_squat", 225), {
      sex: Sex.Male,
      equipment: EQUIPMENT_PRESETS.fullGym,
      impediments: [
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
      ],
    });

    expect(result.workout.movements[0].movementId).toBe("back_extension");
    expect(result.workout.movements[0].movement!.loadedJoints).not.toContain(
      Joint.Knees,
    );
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]).toMatchObject({
      movementIndex: 0,
      originalMovementId: "back_squat",
      personalisedMovementId: "back_extension",
    });
    expect(result.changes[0].explanations.join(" ")).toContain("knees");
  });

  it("fails closed and explains when no safe substitute exists", () => {
    const constraints = buildInjuryConstraints(
      { muscles: Object.values(Muscle), joints: [] },
      ImpedimentSeverity.Severe,
    );
    const workout = workoutWith("back_squat", 225);

    expect(() =>
      personaliseWorkout(workout, {
        sex: Sex.Male,
        equipment: EQUIPMENT_PRESETS.fullGym,
        impediments: [
          {
            id: "all-muscle-injury",
            category: ImpedimentCategory.AcuteInjury,
            severity: ImpedimentSeverity.Severe,
            affectedMuscles: Object.values(Muscle),
            affectedJoints: [],
            description: "No muscular loading is currently safe",
            startDate: "2026-08-17",
            constraints,
          },
        ],
      }),
    ).toThrow(UnableToPersonaliseWorkoutError);

    try {
      personaliseWorkout(workout, {
        sex: Sex.Male,
        equipment: EQUIPMENT_PRESETS.fullGym,
        impediments: [
          {
            id: "all-muscle-injury",
            category: ImpedimentCategory.AcuteInjury,
            severity: ImpedimentSeverity.Severe,
            affectedMuscles: Object.values(Muscle),
            affectedJoints: [],
            description: "No muscular loading is currently safe",
            startDate: "2026-08-17",
            constraints,
          },
        ],
      });
    } catch (error) {
      expect(error).toBeInstanceOf(UnableToPersonaliseWorkoutError);
      expect(
        (error as UnableToPersonaliseWorkoutError).unresolved[0],
      ).toMatchObject({
        movementIndex: 0,
        movementId: "back_squat",
      });
      expect(
        (error as UnableToPersonaliseWorkoutError).unresolved[0].explanations,
      ).not.toEqual([]);
    }
  });

  it("personalises a stored Workout whose Movement objects are not hydrated", () => {
    const workout = workoutWith("back_squat", 225);
    delete workout.movements[0].movement;
    const constraints = buildInjuryConstraints(
      { muscles: [], joints: [Joint.Knees] },
      ImpedimentSeverity.Moderate,
    );

    const result = personaliseWorkout(workout, {
      sex: Sex.Male,
      equipment: EQUIPMENT_PRESETS.fullGym,
      impediments: [
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
      ],
    });

    expect(result.workout.movements[0].movementId).toBe("back_extension");
  });

  it("uses the replacement's prescription when equipment forces a substitution", () => {
    const result = personaliseWorkout(workoutWith("back_squat", 225), {
      sex: Sex.Male,
      equipment: EQUIPMENT_PRESETS.minimal,
      impediments: [],
    });

    expect(result.workout.movements[0]).toMatchObject({
      movementId: "air_squat",
      reps: 10,
    });
    expect(result.workout.movements[0].load).toBeUndefined();
    expect(result.changes[0].explanations.join(" ")).toContain(
      "Missing equipment",
    );
  });

  it("rebuilds the prescription when a substitution changes load type", () => {
    const workout = workoutWith("row");
    workout.movements[0] = {
      movementId: "row",
      movement: getMovementOrThrow("row"),
      calories: 20,
    };

    const result = personaliseWorkout(workout, {
      sex: Sex.Male,
      equipment: EQUIPMENT_PRESETS.bodyweight,
      impediments: [],
    });

    expect(result.workout.movements[0]).toMatchObject({
      movementId: "run",
      distance: 200,
    });
    expect(result.workout.movements[0].calories).toBeUndefined();
    expect(result.workout.movements[0].reps).toBeUndefined();
    expect(result.workout.movements[0].load).toBeUndefined();
    expect(result.workout.movements[0].duration).toBeUndefined();
  });

  it("leaves an unconstrained Athlete's Workout untouched", () => {
    const workout = workoutWith("back_squat", 225);
    delete workout.movements[0].movement;
    const original = structuredClone(workout);

    const result = personaliseWorkout(workout, {
      sex: Sex.Male,
      equipment: EQUIPMENT_PRESETS.fullGym,
      impediments: [],
    });

    expect(result.workout).toEqual(original);
    expect(result.changes).toEqual([]);
    expect(workout).toEqual(original);
  });

  it("scales a permitted load and explains the change", () => {
    const constraints = buildInjuryConstraints(
      { muscles: [], joints: [Joint.Neck] },
      ImpedimentSeverity.Moderate,
    );

    const result = personaliseWorkout(workoutWith("back_squat", 225), {
      sex: Sex.Male,
      equipment: EQUIPMENT_PRESETS.fullGym,
      impediments: [
        {
          id: "neck-injury",
          category: ImpedimentCategory.AcuteInjury,
          severity: ImpedimentSeverity.Moderate,
          affectedMuscles: [],
          affectedJoints: [Joint.Neck],
          description: "Neck injury",
          startDate: "2026-08-17",
          constraints,
        },
      ],
    });

    expect(result.workout.movements[0].movementId).toBe("back_squat");
    expect(result.workout.movements[0].load).toBe(113);
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0].explanations.join(" ")).toContain(
      "Load capped at 50%",
    );
  });

  it("is deterministic for the same Workout and Athlete context", () => {
    const context = {
      sex: Sex.Male,
      equipment: EQUIPMENT_PRESETS.minimal,
      impediments: [],
    };
    const workout = workoutWith("back_squat", 225);

    expect(personaliseWorkout(workout, context)).toEqual(
      personaliseWorkout(workout, context),
    );
  });
});

describe("createMovementPrescription", () => {
  it("keeps duration and rep prescriptions mutually exclusive", () => {
    const bodyweightMovement = getMovementOrThrow("air_squat");
    const durationMovement = {
      ...bodyweightMovement,
      id: "static_hold",
      loadType: LoadType.Duration,
    };

    expect(
      createMovementPrescription(durationMovement, WorkoutFormat.AMRAP, Sex.Male),
    ).toMatchObject({ duration: 30 });
    expect(
      createMovementPrescription(durationMovement, WorkoutFormat.AMRAP, Sex.Male),
    ).not.toHaveProperty("reps");
    expect(
      createMovementPrescription(bodyweightMovement, WorkoutFormat.AMRAP, Sex.Male),
    ).toMatchObject({ reps: 15 });
    expect(
      createMovementPrescription(bodyweightMovement, WorkoutFormat.AMRAP, Sex.Male),
    ).not.toHaveProperty("duration");
  });
});
