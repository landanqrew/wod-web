import { describe, expect, it } from "vitest";
import { Muscle } from "../models/body";
import { ScoreType, WorkoutFormat, type Workout } from "../models/workout";
import {
  findRecoveringMuscles,
  recoveringMusclesLoadedBy,
  type ProgrammedWorkoutHistoryEntry,
} from "./recovery-window";

function workout(
  format: WorkoutFormat,
  movementId: string,
): Workout {
  return {
    id: `${format}-${movementId}`,
    name: "Test workout",
    format,
    movements: [{ movementId, reps: 5 }],
    scoreType: ScoreType.Load,
    isBenchmark: false,
  };
}

const asOf = new Date("2026-08-21T18:00:00.000Z");

describe("Recovery Window", () => {
  it("opens only from recent strength work and expires at the configured boundary", () => {
    const history: ProgrammedWorkoutHistoryEntry[] = [
      {
        gymId: "gym-a",
        startsAt: new Date("2026-08-20T18:00:00.000Z"),
        workout: workout(WorkoutFormat.Strength, "back_squat"),
      },
      {
        gymId: "gym-a",
        startsAt: new Date("2026-08-21T12:00:00.000Z"),
        workout: workout(WorkoutFormat.AMRAP, "shoulder_press"),
      },
      {
        gymId: "gym-a",
        startsAt: new Date("2026-08-19T18:00:00.000Z"),
        workout: workout(WorkoutFormat.Strength, "deadlift"),
      },
      {
        gymId: "gym-a",
        startsAt: new Date("2026-08-21T19:00:00.000Z"),
        workout: workout(WorkoutFormat.Strength, "bench_press"),
      },
    ];

    const recovering = findRecoveringMuscles(history, "gym-a", asOf, 48);

    expect(recovering).toEqual(
      new Set([
        Muscle.Quads,
        Muscle.Glutes,
        Muscle.Hamstrings,
        Muscle.Core,
        Muscle.LowerBack,
        Muscle.Adductors,
      ]),
    );
    expect(recovering).not.toContain(Muscle.Shoulders);
    expect(recovering).not.toContain(Muscle.Chest);
  });

  it("is scoped to one Gym's own programming history", () => {
    const recovering = findRecoveringMuscles(
      [
        {
          gymId: "gym-b",
          startsAt: new Date("2026-08-21T12:00:00.000Z"),
          workout: workout(WorkoutFormat.Strength, "back_squat"),
        },
      ],
      "gym-a",
      asOf,
      48,
    );

    expect(recovering).toEqual(new Set());
  });

  it("warns only when new strength work loads a recovering Muscle", () => {
    const recovering = new Set([Muscle.Quads, Muscle.Glutes]);

    expect(
      recoveringMusclesLoadedBy(
        workout(WorkoutFormat.Strength, "front_squat"),
        recovering,
      ),
    ).toEqual(new Set([Muscle.Quads, Muscle.Glutes]));
    expect(
      recoveringMusclesLoadedBy(
        workout(WorkoutFormat.AMRAP, "front_squat"),
        recovering,
      ),
    ).toEqual(new Set());
  });
});
