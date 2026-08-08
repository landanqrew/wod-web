import { describe, it, expect, beforeEach } from "vitest";
import { FatigueTracker } from "./fatigue-tracker";
import type { WorkoutResult } from "../models/workout-result";
import { ScoreType } from "../models/workout";

function makeResult(overrides: Partial<WorkoutResult> = {}): WorkoutResult {
  return {
    id: `result_${Math.random().toString(36).slice(2, 8)}`,
    athleteId: "athlete_1",
    workoutId: "wod_1",
    performedAt: new Date().toISOString(),
    scoreType: ScoreType.RoundsAndReps,
    rx: true,
    movementResults: [],
    ...overrides,
  };
}

describe("FatigueTracker", () => {
  let results: WorkoutResult[];
  let tracker: FatigueTracker;

  beforeEach(() => {
    results = [];
    tracker = new FatigueTracker(results);
  });

  it("returns minimal report when no data", () => {
    const report = tracker.analyze();
    expect(report.rpeTrend).toHaveLength(0);
    expect(report.weeklyRpeAvg).toBeNull();
    expect(report.monthlyRpeAvg).toBeNull();
    expect(report.recentWorkoutCount).toBe(0);
    expect(report.loadTrend).toBe("insufficient_data");
  });

  it("computes weekly and monthly RPE averages", () => {
    // 4 workouts in last week with RPE
    for (let i = 0; i < 4; i++) {
      results.push(
        makeResult({
          id: `r_${i}`,
          performedAt: new Date(Date.now() - i * 86400000).toISOString(),
          rpe: 7 + i * 0.5, // 7, 7.5, 8, 8.5
          movementResults: [],
        })
      );
    }

    const report = tracker.analyze();
    expect(report.weeklyRpeAvg).not.toBeNull();
    expect(report.monthlyRpeAvg).not.toBeNull();
    expect(report.recentWorkoutCount).toBe(4);
  });

  it("builds RPE trend from results", () => {
    for (let i = 0; i < 5; i++) {
      results.push(
        makeResult({
          id: `r_${i}`,
          performedAt: new Date(Date.now() - (4 - i) * 86400000).toISOString(),
          rpe: 6 + i,
          movementResults: [],
        })
      );
    }

    const report = tracker.analyze();
    expect(report.rpeTrend).toHaveLength(5);
    // Should be ordered oldest first
    expect(report.rpeTrend[0].rpe).toBeLessThanOrEqual(
      report.rpeTrend[report.rpeTrend.length - 1].rpe
    );
  });

  it("detects high RPE warning when all recent workouts are 9+", () => {
    for (let i = 0; i < 6; i++) {
      results.push(
        makeResult({
          id: `r_${i}`,
          performedAt: new Date(Date.now() - i * 86400000).toISOString(),
          rpe: 9.5,
          movementResults: [],
        })
      );
    }

    const report = tracker.analyze();
    const rpeInsights = report.insights.filter(
      (i) => i.category === "rpe_trend" || i.category === "rpe_acute"
    );
    expect(rpeInsights.length).toBeGreaterThanOrEqual(1);
    expect(rpeInsights.some((i) => i.severity === "warning")).toBe(true);
  });

  it("detects consecutive high-intensity days", () => {
    // 4 consecutive days, all RPE 9
    for (let i = 0; i < 4; i++) {
      results.push(
        makeResult({
          id: `r_${i}`,
          performedAt: new Date(Date.now() - i * 86400000).toISOString(),
          rpe: 9,
          movementResults: [],
        })
      );
    }

    const report = tracker.analyze();
    const recoveryInsights = report.insights.filter(
      (i) => i.category === "recovery"
    );
    expect(recoveryInsights.length).toBeGreaterThanOrEqual(1);
  });

  it("detects training spike (overreaching)", () => {
    // 6 workouts this week, but only 2 per week in the prior 3 weeks
    const now = Date.now();
    for (let i = 0; i < 6; i++) {
      results.push(
        makeResult({
          id: `recent_${i}`,
          performedAt: new Date(now - i * 86400000).toISOString(),
          rpe: 7,
          movementResults: [],
        })
      );
    }
    // 6 workouts spread over 3 weeks before that
    for (let i = 0; i < 6; i++) {
      results.push(
        makeResult({
          id: `old_${i}`,
          performedAt: new Date(now - (8 + i * 3) * 86400000).toISOString(),
          rpe: 7,
          movementResults: [],
        })
      );
    }

    const report = tracker.analyze();
    const overreachInsights = report.insights.filter(
      (i) => i.category === "overreaching"
    );
    expect(overreachInsights.length).toBeGreaterThanOrEqual(1);
  });

  it("detects increasing load trend", () => {
    // 8 workouts: first 4 at RPE 5-6, last 4 at RPE 8-9
    for (let i = 0; i < 8; i++) {
      results.push(
        makeResult({
          id: `r_${i}`,
          performedAt: new Date(
            Date.now() - (7 - i) * 3 * 86400000
          ).toISOString(),
          rpe: i < 4 ? 5 + i * 0.25 : 8 + (i - 4) * 0.25,
          movementResults: [],
        })
      );
    }

    const report = tracker.analyze();
    expect(report.loadTrend).toBe("increasing");
  });

  it("detects decreasing load trend", () => {
    for (let i = 0; i < 8; i++) {
      results.push(
        makeResult({
          id: `r_${i}`,
          performedAt: new Date(
            Date.now() - (7 - i) * 3 * 86400000
          ).toISOString(),
          rpe: i < 4 ? 9 - i * 0.25 : 5 - (i - 4) * 0.25,
          movementResults: [],
        })
      );
    }

    const report = tracker.analyze();
    expect(report.loadTrend).toBe("decreasing");
  });
});
