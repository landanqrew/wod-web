import { describe, expect, it } from "vitest";
import { Sex } from "@/lib/domain/models/athlete";
import { ScoreType, WorkoutFormat, type Workout } from "@/lib/domain/models/workout";
import { getMovementOrThrow } from "@/lib/domain/movements";
import { replaceWorkoutMovement } from "./edit-workout";

const workout: Workout = {
  id: "wod_edit",
  name: "TABATA: Farmer's Carry, V-Up",
  format: WorkoutFormat.Tabata,
  movements: [
    { movementId: "farmers_carry", distance: 400, load: 42 },
    { movementId: "v_up", reps: 0 },
  ],
  rounds: 8,
  workInterval: 20,
  restInterval: 10,
  scoreType: ScoreType.Reps,
  isBenchmark: false,
};

describe("replaceWorkoutMovement", () => {
  it("preserves distance but clears a carry load when replacing it with a run", () => {
    const edited = replaceWorkoutMovement(
      workout,
      0,
      getMovementOrThrow("run"),
      Sex.Male,
    );

    expect(edited.movements[0]).toMatchObject({ movementId: "run", distance: 400 });
    expect(edited.movements[0].load).toBeUndefined();
    expect(edited.name).toBe("TABATA: Run, V-Up");
    expect(workout.movements[0]).toMatchObject({
      movementId: "farmers_carry",
      distance: 400,
      load: 42,
    });
  });

  it("rebuilds incompatible quantity fields for the new load type", () => {
    const edited = replaceWorkoutMovement(
      workout,
      0,
      getMovementOrThrow("air_squat"),
      Sex.Female,
    );

    expect(edited.movements[0].movementId).toBe("air_squat");
    expect(edited.movements[0].reps).toBe(0);
    expect(edited.movements[0].distance).toBeUndefined();
    expect(edited.movements[0].load).toBeUndefined();
  });

  it("includes the prescribed load when swapping to a loaded carry", () => {
    const runWorkout: Workout = {
      ...workout,
      movements: [{ movementId: "run", distance: 800 }],
    };
    const edited = replaceWorkoutMovement(
      runWorkout,
      0,
      getMovementOrThrow("farmers_carry"),
      Sex.Female,
    );

    expect(edited.movements[0]).toMatchObject({
      movementId: "farmers_carry",
      distance: 800,
      load: 45,
    });
  });
});
