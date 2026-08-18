import { describe, expect, it } from "vitest";
import type { WorkoutResult } from "../models/workout-result";
import {
  applyLoadAdjustment,
  deriveLoadAdjustmentRatio,
  loadAdjustmentReview,
} from "./load-adjustment";

describe("Load Adjustment policy", () => {
  it("stores a library-relative ratio and applies it to each programmed load", () => {
    const ratio = deriveLoadAdjustmentRatio(67, 95);
    expect(ratio).toBeCloseTo(0.7053, 4);
    expect(
      applyLoadAdjustment(
        { movementId: "thruster", reps: 12, load: 65 },
        { movementId: "thruster", ratio },
      ),
    ).toEqual({ movementId: "thruster", reps: 12, load: 46 });
    expect(
      applyLoadAdjustment(
        { movementId: "thruster", reps: 3, load: 135 },
        { movementId: "thruster", ratio },
      ),
    ).toEqual({ movementId: "thruster", reps: 3, load: 95 });
  });

  it("never touches reps or another Movement and rejects automatic increases", () => {
    expect(
      applyLoadAdjustment(
        { movementId: "push_press", reps: 10, load: 95 },
        { movementId: "thruster", ratio: 0.7 },
      ),
    ).toEqual({ movementId: "push_press", reps: 10, load: 95 });
    expect(() => deriveLoadAdjustmentRatio(100, 95)).toThrow(
      "cannot increase load",
    );
    expect(() =>
      applyLoadAdjustment(
        { movementId: "thruster", reps: 10, load: 95 },
        { movementId: "thruster", ratio: 1.01 },
      ),
    ).toThrow("cannot increase load");
  });

  it("prompts only after the configured consecutive clean-session run", () => {
    const results = Array.from({ length: 5 }, (_, index) =>
      result(`2027-04-${String(index + 1).padStart(2, "0")}`, true, 67),
    );
    expect(
      loadAdjustmentReview(results.slice(0, 4), {
        movementId: "thruster",
        referenceLoad: 67,
        createdAt: "2027-04-01T00:00:00.000Z",
        requiredCleanSessions: 5,
      }),
    ).toEqual({ cleanSessionRun: 4, reviewDue: false });
    expect(
      loadAdjustmentReview(results, {
        movementId: "thruster",
        referenceLoad: 67,
        createdAt: "2027-04-01T00:00:00.000Z",
        requiredCleanSessions: 5,
      }),
    ).toEqual({ cleanSessionRun: 5, reviewDue: true });
  });

  it("resets the clean run on a scaled, light, or pre-promotion result", () => {
    const results = [
      result("2027-04-06", true, 67),
      result("2027-04-05", false, 67),
      result("2027-04-04", true, 67),
      result("2027-03-20", true, 67),
    ];
    expect(
      loadAdjustmentReview(results, {
        movementId: "thruster",
        referenceLoad: 67,
        createdAt: "2027-04-01T00:00:00.000Z",
        requiredCleanSessions: 2,
      }),
    ).toEqual({ cleanSessionRun: 1, reviewDue: false });
    expect(
      loadAdjustmentReview(
        [result("2027-04-06", true, 66), result("2027-04-05", true, 67)],
        {
          movementId: "thruster",
          referenceLoad: 67,
          createdAt: "2027-04-01T00:00:00.000Z",
          requiredCleanSessions: 2,
        },
      ),
    ).toEqual({ cleanSessionRun: 0, reviewDue: false });
  });
});

function result(date: string, rx: boolean, load: number): WorkoutResult {
  return {
    id: `result_${date}`,
    athleteId: "athlete_1",
    workoutId: `workout_${date}`,
    performedAt: `${date}T12:00:00.000Z`,
    scoreType: "load" as WorkoutResult["scoreType"],
    rx,
    movementResults: [{ movementId: "thruster", load, reps: 5, rx }],
  };
}
