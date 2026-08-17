import { describe, it, expect } from "vitest";
import { findSubstitution, scaleWorkoutMovements } from "./substitution";
import {
  buildPregnancyConstraints,
  buildInjuryConstraints,
  ImpedimentSeverity,
} from "../models/impediment";
import { Joint, Muscle } from "../models/body";
import { EQUIPMENT_PRESETS } from "../models/equipment";
import { getMovementOrThrow } from "../movements/library";

describe("findSubstitution", () => {
  it("returns the original movement when no constraints", () => {
    const backSquat = getMovementOrThrow("back_squat");
    const result = findSubstitution(
      backSquat,
      null,
      EQUIPMENT_PRESETS.fullGym
    );
    expect(result.replacement?.id).toBe("back_squat");
    expect(result.loadScale).toBe(1);
  });

  it("substitutes barbell movement when only dumbbells available", () => {
    const backSquat = getMovementOrThrow("back_squat");
    const result = findSubstitution(
      backSquat,
      null,
      EQUIPMENT_PRESETS.minimal
    );
    // back_squat subs: air_squat, goblet_squat, dumbbell_squat, front_squat
    // minimal has dumbbells, so goblet_squat or dumbbell_squat should work
    expect(result.replacement).not.toBeNull();
    expect(["goblet_squat", "dumbbell_squat", "air_squat"]).toContain(
      result.replacement!.id
    );
  });

  it("substitutes to bodyweight when only bodyweight available", () => {
    const backSquat = getMovementOrThrow("back_squat");
    const result = findSubstitution(
      backSquat,
      null,
      EQUIPMENT_PRESETS.bodyweight
    );
    // Should fall to air_squat (first in chain, bodyweight)
    expect(result.replacement?.id).toBe("air_squat");
  });

  it("finds a non-inverted substitute for HSPU during pregnancy", () => {
    const hspu = getMovementOrThrow("handstand_push_up");
    const constraints = buildPregnancyConstraints(1);
    const result = findSubstitution(
      hspu,
      constraints,
      EQUIPMENT_PRESETS.fullGym
    );
    expect(result.replacement).not.toBeNull();
    expect(result.replacement!.tags).not.toContain("inverted");
  });

  it("finds a non-overhead substitute during pregnancy T3 via broad search", () => {
    const strictPress = getMovementOrThrow("strict_press");
    const constraints = buildPregnancyConstraints(3);
    const result = findSubstitution(
      strictPress,
      constraints,
      EQUIPMENT_PRESETS.fullGym
    );
    // strict_press subs: dumbbell_press, push_press -- both overhead
    // Broader search should find a Push-group movement that isn't overhead
    // (e.g., push_up, bench_press, floor_press)
    expect(result.replacement).not.toBeNull();
    expect(result.replacement!.tags).not.toContain("overhead");
    const originalMuscles = new Set([
      ...strictPress.primaryMuscles,
      ...strictPress.secondaryMuscles,
    ]);
    expect(
      [
        ...result.replacement!.primaryMuscles,
        ...result.replacement!.secondaryMuscles,
      ].some((muscle) => originalMuscles.has(muscle))
    ).toBe(true);
  });

  it("includes fallback warning when using broad muscle-group search", () => {
    const strictPress = getMovementOrThrow("strict_press");
    const constraints = buildPregnancyConstraints(3);
    const result = findSubstitution(
      strictPress,
      constraints,
      EQUIPMENT_PRESETS.fullGym
    );
    expect(result.replacementWarnings).toContain(
      "Substituted via shared-Muscle fallback (not a direct substitution)"
    );
  });

  it("applies load scaling when constraints cap load", () => {
    const gobletSquat = getMovementOrThrow("goblet_squat");
    const constraints = buildPregnancyConstraints(2);
    const result = findSubstitution(
      gobletSquat,
      constraints,
      EQUIPMENT_PRESETS.fullGym
    );
    // Pregnancy T2 caps at 70%, goblet squat should still be allowed
    // but with load scaling
    expect(result.loadScale).toBe(0.7);
  });

  it("returns null replacement when no valid substitute exists", () => {
    // Every Muscle is protected, so no movement can be a valid fallback.
    const constraints = buildInjuryConstraints(
      {
        muscles: Object.values(Muscle),
        joints: [],
      },
      ImpedimentSeverity.Severe
    );
    const hspu = getMovementOrThrow("handstand_push_up");
    const result = findSubstitution(
      hspu,
      constraints,
      EQUIPMENT_PRESETS.bodyweight
    );
    expect(result.replacement).toBeNull();
  });

  it("offers a safe Substitution for a movement blocked by a Joint Impediment", () => {
    const constraints = buildInjuryConstraints(
      { muscles: [], joints: [Joint.Knees] },
      ImpedimentSeverity.Moderate
    );

    const result = findSubstitution(
      getMovementOrThrow("back_squat"),
      constraints,
      EQUIPMENT_PRESETS.fullGym
    );

    expect(result.replacement).not.toBeNull();
    expect(result.replacement!.loadedJoints).not.toContain(Joint.Knees);
  });

  it("keeps a safe movement pool for a Spine Impediment", () => {
    const constraints = buildInjuryConstraints(
      { muscles: [], joints: [Joint.Spine] },
      ImpedimentSeverity.Moderate
    );

    const result = findSubstitution(
      getMovementOrThrow("back_squat"),
      constraints,
      EQUIPMENT_PRESETS.fullGym
    );

    expect(result.replacement).not.toBeNull();
    expect(result.replacement!.loadedJoints).not.toContain(Joint.Spine);
    expect(
      findSubstitution(
        getMovementOrThrow("bike_erg"),
        constraints,
        EQUIPMENT_PRESETS.fullGym
      ).replacement?.id
    ).toBe("bike_erg");
  });
});

describe("scaleWorkoutMovements", () => {
  it("scales all movements in a workout", () => {
    const movements = [
      getMovementOrThrow("back_squat"),
      getMovementOrThrow("pull_up"),
      getMovementOrThrow("run"),
    ];
    const results = scaleWorkoutMovements(
      movements,
      null,
      EQUIPMENT_PRESETS.bodyweight
    );
    expect(results).toHaveLength(3);
    // back_squat needs sub (no barbell), pull_up needs sub (no bar), run is fine
    expect(results[0].replacement?.id).toBe("air_squat");
    expect(results[2].replacement?.id).toBe("run");
  });
});
