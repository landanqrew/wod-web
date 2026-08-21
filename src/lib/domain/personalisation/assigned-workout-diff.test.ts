import { describe, expect, it } from "vitest";
import { Sex } from "../models/athlete";
import type { AssignedWorkout } from "../models/assigned-workout";
import { ScoreType, WorkoutFormat, type Workout } from "../models/workout";
import {
  diffAssignedWorkout,
  summariseScalingPatterns,
} from "./assigned-workout-diff";

const programmed: Workout = {
  id: "programmed",
  name: "Heavy squats",
  format: WorkoutFormat.Strength,
  movements: [
    {
      movementId: "back_squat",
      reps: 5,
      rxLoad: { male: 225, female: 155 },
    },
  ],
  rounds: 5,
  scoreType: ScoreType.Load,
  isBenchmark: false,
};

function assigned(
  movementId: string,
  load: number,
  provenance: AssignedWorkout["provenance"][number],
): AssignedWorkout {
  return {
    id: "assigned",
    reservationId: "reservation",
    workout: {
      ...programmed,
      movements: [{ movementId, reps: 5, load }],
    },
    provenance: [provenance],
    changes: [],
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

describe("Assigned Workout roster diff", () => {
  it("does not treat sex-side Rx resolution as divergence", () => {
    expect(
      diffAssignedWorkout(
        programmed,
        assigned("back_squat", 155, {
          programmedMovementId: "back_squat",
          movementId: "programmed",
          reps: "programmed",
          load: "programmed",
        }),
        Sex.Female,
      ),
    ).toEqual([]);
  });

  it("shows substitutions and athlete overrides with provenance", () => {
    const substitution = assigned("ring_row", 155, {
      programmedMovementId: "back_squat",
      movementId: "adjusted",
      reps: "programmed",
      load: "programmed",
    });
    expect(diffAssignedWorkout(programmed, substitution, Sex.Female)).toEqual([
      expect.objectContaining({
        movementIndex: 0,
        programmedMovementId: "back_squat",
        assignedMovementId: "ring_row",
        fields: [
          {
            field: "movementId",
            programmedValue: "back_squat",
            assignedValue: "ring_row",
            provenance: "adjusted",
          },
        ],
      }),
    ]);

    const override = assigned("back_squat", 95, {
      programmedMovementId: "back_squat",
      movementId: "programmed",
      reps: "programmed",
      load: "overridden",
    });
    expect(diffAssignedWorkout(programmed, override, Sex.Female)[0]?.fields).toEqual([
      {
        field: "load",
        programmedValue: 155,
        assignedValue: 95,
        provenance: "overridden",
      },
    ]);
  });

  it("surfaces a Movement changed by multiple distinct athletes as a pattern", () => {
    const diffs = diffAssignedWorkout(
      programmed,
      assigned("ring_row", 155, {
        programmedMovementId: "back_squat",
        movementId: "adjusted",
      }),
      Sex.Female,
    );
    expect(
      summariseScalingPatterns([
        { athleteId: "athlete-a", diffs },
        { athleteId: "athlete-b", diffs },
        { athleteId: "athlete-a", diffs },
      ]),
    ).toEqual([
      {
        programmedMovementId: "back_squat",
        programmedMovementName: "Back Squat",
        athleteCount: 2,
      },
    ]);
  });
});
