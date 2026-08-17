import { describe, it, expect } from "vitest";
import {
  checkMovement,
  mergeConstraints,
  filterAllowedMovements,
} from "./constraint-engine";
import {
  buildPregnancyConstraints,
  buildPostpartumConstraints,
  buildInjuryConstraints,
  ImpedimentCategory,
  ImpedimentSeverity,
} from "../models/impediment";
import type { Impediment } from "../models/impediment";
import { Joint, Muscle } from "../models/body";
import { Equipment } from "../models/equipment";
import { EQUIPMENT_PRESETS } from "../models/equipment";
import { getMovementOrThrow, getAllMovements } from "../movements/library";

describe("checkMovement", () => {
  it("allows a movement when no constraints and equipment is available", () => {
    const airSquat = getMovementOrThrow("air_squat");
    const result = checkMovement(airSquat, null, EQUIPMENT_PRESETS.bodyweight);
    expect(result.allowed).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it("rejects a movement when required equipment is missing", () => {
    const backSquat = getMovementOrThrow("back_squat");
    const result = checkMovement(backSquat, null, EQUIPMENT_PRESETS.bodyweight);
    expect(result.allowed).toBe(false);
    expect(result.reasons.some((r) => r.includes("Missing equipment"))).toBe(true);
  });

  it("rejects overhead movements during pregnancy T3", () => {
    const strictPress = getMovementOrThrow("strict_press");
    const constraints = buildPregnancyConstraints(3);
    const result = checkMovement(strictPress, constraints, EQUIPMENT_PRESETS.fullGym);
    expect(result.allowed).toBe(false);
    expect(result.reasons.some((r) => r.includes("Overhead"))).toBe(true);
  });

  it("rejects inverted movements during pregnancy T1", () => {
    const hspu = getMovementOrThrow("handstand_push_up");
    const constraints = buildPregnancyConstraints(1);
    const result = checkMovement(hspu, constraints, EQUIPMENT_PRESETS.fullGym);
    expect(result.allowed).toBe(false);
    expect(result.reasons.some((r) => r.includes("Inverted"))).toBe(true);
  });

  it("rejects kipping movements during pregnancy T2", () => {
    const kippingPU = getMovementOrThrow("kipping_pull_up");
    const constraints = buildPregnancyConstraints(2);
    const result = checkMovement(kippingPU, constraints, EQUIPMENT_PRESETS.fullGym);
    expect(result.allowed).toBe(false);
    expect(result.reasons.some((r) => r.includes("Kipping"))).toBe(true);
  });

  it("rejects prone movements during pregnancy T2", () => {
    const burpee = getMovementOrThrow("burpee");
    const constraints = buildPregnancyConstraints(2);
    const result = checkMovement(burpee, constraints, EQUIPMENT_PRESETS.fullGym);
    expect(result.allowed).toBe(false);
    expect(result.reasons.some((r) => r.includes("Prone") || r.includes("impact"))).toBe(true);
  });

  it("allows bodyweight squats during pregnancy T2", () => {
    const airSquat = getMovementOrThrow("air_squat");
    const constraints = buildPregnancyConstraints(2);
    const result = checkMovement(airSquat, constraints, EQUIPMENT_PRESETS.fullGym);
    expect(result.allowed).toBe(true);
  });

  it("caps load during pregnancy T2 at 70%", () => {
    const gobletSquat = getMovementOrThrow("goblet_squat");
    const constraints = buildPregnancyConstraints(2);
    const result = checkMovement(gobletSquat, constraints, EQUIPMENT_PRESETS.fullGym);
    expect(result.maxLoadPercent).toBe(70);
  });

  it("rejects weighted movements when severity is severe", () => {
    const constraints = buildInjuryConstraints(
      { muscles: [Muscle.Shoulders], joints: [] },
      ImpedimentSeverity.Severe
    );
    const strictPress = getMovementOrThrow("strict_press");
    const result = checkMovement(strictPress, constraints, EQUIPMENT_PRESETS.fullGym);
    expect(result.allowed).toBe(false);
  });

  it("rejects movements stressing injured primary region", () => {
    const constraints = buildInjuryConstraints(
      { muscles: [Muscle.Shoulders], joints: [] },
      ImpedimentSeverity.Moderate
    );
    const strictPress = getMovementOrThrow("strict_press");
    // strict_press primaryMuscles: Shoulders, Triceps -- Shoulders is avoided
    const result = checkMovement(strictPress, constraints, EQUIPMENT_PRESETS.fullGym);
    expect(result.allowed).toBe(false);
    expect(result.reasons).not.toHaveLength(0);
  });

  it("blocks movements that load an injured knee", () => {
    const constraints = buildInjuryConstraints(
      { muscles: [], joints: [Joint.Knees] },
      ImpedimentSeverity.Moderate
    );

    for (const movementId of ["back_squat", "walking_lunge", "box_jump"]) {
      const movement = getMovementOrThrow(movementId);
      const result = checkMovement(
        movement,
        constraints,
        EQUIPMENT_PRESETS.fullGym
      );

      expect(result.allowed, movement.name).toBe(false);
    }
  });

  it("blocks front-rack and pressing movements that load an injured wrist", () => {
    const constraints = buildInjuryConstraints(
      { muscles: [], joints: [Joint.Wrists] },
      ImpedimentSeverity.Moderate
    );

    for (const movementId of ["front_squat", "strict_press"]) {
      const result = checkMovement(
        getMovementOrThrow(movementId),
        constraints,
        EQUIPMENT_PRESETS.fullGym
      );

      expect(result.allowed, movementId).toBe(false);
    }
  });

  it("blocks pulling and pressing movements that load an injured elbow", () => {
    const constraints = buildInjuryConstraints(
      { muscles: [], joints: [Joint.Elbows] },
      ImpedimentSeverity.Moderate
    );

    for (const movementId of ["pull_up", "strict_press"]) {
      const result = checkMovement(
        getMovementOrThrow(movementId),
        constraints,
        EQUIPMENT_PRESETS.fullGym
      );

      expect(result.allowed, movementId).toBe(false);
    }
  });

  it("blocks isometric support through an injured shoulder Joint", () => {
    const constraints = buildInjuryConstraints(
      { muscles: [], joints: [Joint.Shoulders] },
      ImpedimentSeverity.Moderate
    );

    for (const movementId of ["plank", "front_squat", "pull_up"]) {
      const result = checkMovement(
        getMovementOrThrow(movementId),
        constraints,
        EQUIPMENT_PRESETS.fullGym
      );

      expect(result.allowed, movementId).toBe(false);
    }
    expect(constraints.allowOverhead).toBe(false);

    const migratedLegacyShoulder = buildInjuryConstraints(
      {
        muscles: [Muscle.Shoulders],
        joints: [Joint.Shoulders],
      },
      ImpedimentSeverity.Moderate
    );
    expect(migratedLegacyShoulder.notes).not.toContain("shoulders, shoulders");
  });

  it("allows movements that don't stress injured region", () => {
    const constraints = buildInjuryConstraints(
      { muscles: [Muscle.Shoulders], joints: [] },
      ImpedimentSeverity.Moderate
    );
    const row = getMovementOrThrow("row");
    // Row primary: Hamstrings, UpperBack. Secondary: Quads, Biceps, Core.
    // Shoulders not involved at all -- should be fully allowed
    const result = checkMovement(row, constraints, EQUIPMENT_PRESETS.fullGym);
    expect(result.allowed).toBe(true);
  });

  it("warns without blocking when only a secondary Muscle is protected", () => {
    const constraints = buildInjuryConstraints(
      { muscles: [Muscle.UpperBack], joints: [] },
      ImpedimentSeverity.Moderate
    );
    const strictPress = getMovementOrThrow("strict_press");

    const result = checkMovement(
      strictPress,
      constraints,
      EQUIPMENT_PRESETS.fullGym
    );

    expect(result.allowed).toBe(true);
    expect(result.warnings).not.toHaveLength(0);
  });

  it("rejects high-impact movements for early postpartum", () => {
    const constraints = buildPostpartumConstraints(4);
    const boxJump = getMovementOrThrow("box_jump");
    const result = checkMovement(boxJump, constraints, EQUIPMENT_PRESETS.fullGym);
    expect(result.allowed).toBe(false);
  });
});

describe("mergeConstraints", () => {
  it("returns null for empty impediments", () => {
    expect(mergeConstraints([])).toBeNull();
  });

  it("merges multiple impediments using most restrictive values", () => {
    const impediments: Impediment[] = [
      {
        id: "1",
        category: ImpedimentCategory.Pregnancy,
        severity: ImpedimentSeverity.Moderate,
        affectedMuscles: [Muscle.Core],
        affectedJoints: [],
        description: "Pregnancy T2",
        startDate: "2025-01-01",
        trimester: 2,
        constraints: buildPregnancyConstraints(2),
      },
      {
        id: "2",
        category: ImpedimentCategory.AcuteInjury,
        severity: ImpedimentSeverity.Mild,
        affectedMuscles: [],
        affectedJoints: [Joint.Wrists],
        description: "Wrist strain",
        startDate: "2025-06-01",
        constraints: buildInjuryConstraints(
          { muscles: [], joints: [Joint.Wrists] },
          ImpedimentSeverity.Mild
        ),
      },
    ];

    const merged = mergeConstraints(impediments);
    expect(merged).not.toBeNull();
    expect(merged!.avoidMuscles).toContain(Muscle.Core);
    // Pregnancy T2 disallows kipping, so merged should too
    expect(merged!.allowKipping).toBe(false);
    // Pregnancy T2 disallows high impact, so merged should too
    expect(merged!.allowHighImpact).toBe(false);
    // Load cap should be the minimum: pregnancy T2 = 70, mild injury = 80
    expect(merged!.maxLoadPercent).toBe(70);
  });
});

describe("filterAllowedMovements", () => {
  it("returns only bodyweight movements for bodyweight equipment", () => {
    const all = getAllMovements();
    const filtered = filterAllowedMovements(
      all,
      null,
      EQUIPMENT_PRESETS.bodyweight
    );
    for (const m of filtered) {
      expect(
        m.equipment.every((e) => e === Equipment.None)
      ).toBe(true);
    }
  });

  it("returns fewer movements with pregnancy T3 constraints", () => {
    const all = getAllMovements();
    const unconstrained = filterAllowedMovements(
      all,
      null,
      EQUIPMENT_PRESETS.fullGym
    );
    const constraints = buildPregnancyConstraints(3);
    const constrained = filterAllowedMovements(
      all,
      constraints,
      EQUIPMENT_PRESETS.fullGym
    );
    expect(constrained.length).toBeLessThan(unconstrained.length);
    expect(constrained.length).toBeGreaterThan(0); // should still have some options
  });
});
