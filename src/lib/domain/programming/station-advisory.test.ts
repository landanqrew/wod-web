import { describe, expect, it } from "vitest";
import { Equipment } from "../models/equipment";
import { ScoreType, WorkoutFormat, type Workout } from "../models/workout";
import { findStationWarnings } from "./station-advisory";

const workout: Workout = {
  id: "station-test",
  name: "Row and thrusters",
  format: WorkoutFormat.RoundsForTime,
  movements: [
    { movementId: "row", distance: 500 },
    {
      movementId: "thruster",
      reps: 15,
      rxLoad: { male: 95, female: 65 },
    },
  ],
  rounds: 5,
  timeCap: 20,
  scoreType: ScoreType.Time,
  isBenchmark: false,
};

describe("Station advisory", () => {
  it("names the Movement and Station shortfall at the reserved headcount", () => {
    expect(
      findStationWarnings(
        workout,
        { [Equipment.Rower]: 12 },
        25,
      ),
    ).toEqual([
      {
        movementId: "row",
        movementName: "Row",
        equipment: Equipment.Rower,
        reservedHeadcount: 25,
        availableStations: 12,
        shortfall: 13,
      },
    ]);
  });

  it("does not warn when the declared Station count is sufficient", () => {
    expect(
      findStationWarnings(
        workout,
        { [Equipment.Rower]: 25 },
        25,
      ),
    ).toEqual([]);
  });

  it("does not infer a warning from an undeclared Station count", () => {
    expect(findStationWarnings(workout, {}, 25)).toEqual([]);
  });

  it("deduplicates a repeated Movement without collapsing distinct Movements", () => {
    expect(
      findStationWarnings(
        { ...workout, movements: [workout.movements[0], workout.movements[0]] },
        { [Equipment.Rower]: 1 },
        3,
      ),
    ).toHaveLength(1);

    const sharedBarbell: Workout = {
      ...workout,
      movements: [
        { movementId: "thruster", reps: 10 },
        { movementId: "push_press", reps: 10 },
      ],
    };
    expect(
      findStationWarnings(
        sharedBarbell,
        { [Equipment.Barbell]: 1 },
        3,
      ).map(({ movementId }) => movementId),
    ).toEqual(["thruster", "push_press"]);
  });
});
