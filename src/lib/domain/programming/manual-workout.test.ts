import { describe, expect, it } from "vitest";
import {
  generateOptionsSchema,
  programmedWorkoutSchema,
} from "../../validation";
import { WorkoutFormat } from "../models/workout";
import {
  changeProgrammedWorkoutFormat,
  createManualProgrammedWorkout,
} from "./manual-workout";

describe("manual Programmed Workout formats", () => {
  it("creates a server-valid prescription for every offered format", () => {
    for (const format of Object.values(WorkoutFormat)) {
      const workout = changeProgrammedWorkoutFormat(
        createManualProgrammedWorkout(),
        format,
      );
      expect(
        programmedWorkoutSchema.safeParse({ ...workout, name: format }).success,
        format,
      ).toBe(true);
    }
  });

  it("clears fields from the previous format when the Coach switches formats", () => {
    const interval = changeProgrammedWorkoutFormat(
      createManualProgrammedWorkout(),
      WorkoutFormat.Interval,
    );
    const amrap = changeProgrammedWorkoutFormat(interval, WorkoutFormat.AMRAP);

    expect(amrap).toMatchObject({
      format: WorkoutFormat.AMRAP,
      timeCap: 12,
    });
    expect(amrap.rounds).toBeUndefined();
    expect(amrap.workInterval).toBeUndefined();
    expect(amrap.restInterval).toBeUndefined();
  });

  it("rejects missing required fields and stale fields at the server boundary", () => {
    const workout = createManualProgrammedWorkout();
    expect(
      programmedWorkoutSchema.safeParse({
        ...workout,
        format: WorkoutFormat.EMOM,
      }).success,
    ).toBe(false);
    expect(
      generateOptionsSchema.safeParse({
        format: WorkoutFormat.AMRAP,
        rounds: 5,
      }).success,
    ).toBe(false);
  });
});
