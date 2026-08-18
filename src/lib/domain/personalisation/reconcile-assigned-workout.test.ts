import { describe, expect, it } from "vitest";
import type { AssignedMovementProvenance } from "../models/assigned-workout";
import { ScoreType, WorkoutFormat, type Workout } from "../models/workout";
import {
  reconcileAssignedWorkout,
  type ReconciliationSnapshot,
} from "./reconcile-assigned-workout";

function snapshot(
  workout: Workout,
  provenance: AssignedMovementProvenance[],
  changes: ReconciliationSnapshot["changes"] = [],
): ReconciliationSnapshot {
  return { workout, provenance, changes };
}

function workout(
  movementId: string,
  values: { reps?: number; load?: number; duration?: number } = {},
): Workout {
  return {
    id: "assigned_1",
    name: "Test",
    format: WorkoutFormat.Strength,
    movements: [{ movementId, ...values }],
    rounds: 5,
    scoreType: ScoreType.Load,
    isBenchmark: false,
  };
}

describe("Assigned Workout reconciliation", () => {
  it("preserves overridden parameters while recomputing programmed values", () => {
    const current = snapshot(
      workout("back_squat", { reps: 5, load: 200 }),
      [
        {
          programmedMovementId: "back_squat",
          movementId: "programmed",
          reps: "programmed",
          load: "overridden",
        },
      ],
      [
        {
          movementIndex: 0,
          originalMovementId: "back_squat",
          personalisedMovementId: "back_squat",
          explanations: ["Athlete override: load set to 200 lb"],
        },
      ],
    );
    const derived = snapshot(workout("back_squat", { reps: 3, load: 155 }), [
      {
        programmedMovementId: "back_squat",
        movementId: "programmed",
        reps: "programmed",
        load: "programmed",
      },
    ]);

    const result = reconcileAssignedWorkout(current, derived, [
      { movementId: "back_squat", reps: 3, load: 225 },
    ]);
    expect(result.snapshot.workout.movements[0]).toMatchObject({
      movementId: "back_squat",
      reps: 3,
      load: 200,
    });
    expect(result.snapshot.provenance[0].load).toBe("overridden");
    expect(result.notices).toEqual([]);
    expect(result.snapshot.changes[0].explanations).toEqual([
      "Athlete override: load set to 200 lb",
    ]);
  });

  it("discards and reports overrides when the Coach changes movement identity", () => {
    const current = snapshot(workout("front_squat", { reps: 7, load: 175 }), [
      {
        programmedMovementId: "back_squat",
        movementId: "overridden",
        reps: "overridden",
        load: "overridden",
      },
    ]);
    const derived = snapshot(workout("deadlift", { reps: 5, load: 225 }), [
      {
        programmedMovementId: "deadlift",
        movementId: "programmed",
        reps: "programmed",
        load: "programmed",
      },
    ]);

    const result = reconcileAssignedWorkout(
      current,
      derived,
      derived.workout.movements,
    );
    expect(result.snapshot.workout).toEqual(derived.workout);
    expect(result.snapshot.provenance).toEqual(derived.provenance);
    expect(result.discardedOverrides).toEqual([
      { movementIndex: 0, fields: ["movementId", "reps", "load"] },
    ]);
    expect(result.snapshot.changes[0].explanations.join(" ")).toContain(
      "discarded athlete overrides",
    );
  });

  it("freely recomputes adjusted values when an Impediment clears", () => {
    const current = snapshot(workout("back_extension", { reps: 5 }), [
      {
        programmedMovementId: "back_squat",
        movementId: "adjusted",
        reps: "programmed",
      },
    ]);
    const derived = snapshot(workout("back_squat", { reps: 5, load: 155 }), [
      {
        programmedMovementId: "back_squat",
        movementId: "programmed",
        reps: "programmed",
        load: "programmed",
      },
    ]);

    expect(
      reconcileAssignedWorkout(current, derived, derived.workout.movements)
        .snapshot,
    ).toEqual(derived);
  });

  it("does not move parameter overrides onto a different adjusted Movement", () => {
    const current = snapshot(workout("back_extension", { reps: 12 }), [
      {
        programmedMovementId: "back_squat",
        movementId: "adjusted",
        reps: "overridden",
      },
    ]);
    const derived = snapshot(workout("back_squat", { reps: 5, load: 155 }), [
      {
        programmedMovementId: "back_squat",
        movementId: "programmed",
        reps: "programmed",
        load: "programmed",
      },
    ]);

    const result = reconcileAssignedWorkout(
      current,
      derived,
      derived.workout.movements,
    );
    expect(result.snapshot.workout.movements[0]).toMatchObject({
      movementId: "back_squat",
      reps: 5,
    });
    expect(result.discardedOverrides[0].fields).toEqual(["reps"]);
    expect(result.notices.join(" ")).toContain("discarded athlete overrides");
  });

  it("recomputes heavier warnings from the programmed rather than adjusted load", () => {
    const current = snapshot(
      workout("back_squat", { reps: 5, load: 200 }),
      [
        {
          programmedMovementId: "back_squat",
          movementId: "programmed",
          reps: "programmed",
          load: "overridden",
        },
      ],
      [
        {
          movementIndex: 0,
          originalMovementId: "back_squat",
          personalisedMovementId: "back_squat",
          explanations: [
            "Athlete override: load set to 200 lb",
            "Athlete override warning: movement 1 load is heavier than programmed",
          ],
        },
      ],
    );
    const derived = snapshot(workout("back_squat", { reps: 5, load: 155 }), [
      {
        programmedMovementId: "back_squat",
        movementId: "programmed",
        reps: "programmed",
        load: "adjusted",
      },
    ]);

    const result = reconcileAssignedWorkout(current, derived, [
      { movementId: "back_squat", reps: 5, load: 225 },
    ]);
    expect(result.notices).toEqual([]);
    expect(result.snapshot.changes[0].explanations).toEqual([
      "Athlete override: load set to 200 lb",
    ]);
  });

  it("reports overrides discarded by a removed prescription line", () => {
    const current = snapshot(workout("back_squat", { reps: 7 }), [
      {
        programmedMovementId: "back_squat",
        movementId: "programmed",
        reps: "overridden",
      },
    ]);
    const derived = snapshot(
      { ...workout("back_squat"), movements: [] },
      [],
    );

    const result = reconcileAssignedWorkout(
      current,
      derived,
      derived.workout.movements,
    );
    expect(result.snapshot.workout.movements).toEqual([]);
    expect(result.discardedOverrides[0]).toEqual({
      movementIndex: 0,
      fields: ["reps"],
    });
    expect(result.snapshot.changes[0]).toMatchObject({
      movementIndex: 0,
      personalisedMovementId: "removed",
    });
  });

  it("is a no-op when upstream inputs have not changed", () => {
    const current = snapshot(workout("back_squat", { reps: 5, load: 200 }), [
      {
        programmedMovementId: "back_squat",
        movementId: "programmed",
        reps: "programmed",
        load: "overridden",
      },
    ]);

    expect(
      reconcileAssignedWorkout(current, current, current.workout.movements),
    ).toEqual({
      snapshot: current,
      notices: [],
      discardedOverrides: [],
    });
  });

  it("preserves but surfaces an overridden Movement made unavailable by constraints", () => {
    const current = snapshot(workout("front_squat", { reps: 5, load: 185 }), [
      {
        programmedMovementId: "back_squat",
        movementId: "overridden",
        reps: "overridden",
        load: "overridden",
      },
    ]);
    const derived = snapshot(workout("air_squat", { reps: 5 }), [
      {
        programmedMovementId: "back_squat",
        movementId: "adjusted",
        reps: "programmed",
      },
    ]);

    const result = reconcileAssignedWorkout(
      current,
      derived,
      [{ movementId: "back_squat", reps: 5, load: 225 }],
      new Set([0]),
    );
    expect(result.snapshot.workout.movements[0]).toMatchObject({
      movementId: "front_squat",
      reps: 5,
      load: 185,
    });
    expect(result.notices.join(" ")).toContain("unavailable");
    expect(result.snapshot.changes[0].explanations.join(" ")).toContain(
      "unavailable under current constraints",
    );
  });
});
