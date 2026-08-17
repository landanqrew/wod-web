import { describe, it, expect } from "vitest";
import {
  getAllMovements,
  getMovement,
  getMovementOrThrow,
  getMovementsByModality,
  getMovementsByMovementPattern,
  getMovementsByEquipment,
} from "./library";
import { Modality, MovementPattern } from "../models/body";
import { Equipment } from "../models/equipment";

describe("movement library", () => {
  it("has a reasonable number of movements", () => {
    const all = getAllMovements();
    expect(all.length).toBeGreaterThanOrEqual(50);
  });

  it("has no duplicate IDs", () => {
    const all = getAllMovements();
    const ids = all.map((m) => m.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("every movement has at least one primary region", () => {
    for (const m of getAllMovements()) {
      expect(m.primaryMuscles.length).toBeGreaterThan(0);
    }
  });

  it("every movement declares the joints it loads", () => {
    for (const movement of getAllMovements()) {
      expect(movement.loadedJoints, movement.name).toBeDefined();
      expect(movement.loadedJoints?.length, movement.name).toBeGreaterThan(0);
    }
  });

  it("every movement has at least one Movement Pattern", () => {
    for (const m of getAllMovements()) {
      expect(m.movementPatterns.length).toBeGreaterThan(0);
    }
  });

  it("every substitution reference points to a valid movement", () => {
    const all = getAllMovements();
    const ids = new Set(all.map((m) => m.id));
    for (const m of all) {
      for (const subId of m.substitutions) {
        expect(ids.has(subId)).toBe(true);
      }
    }
  });

  it("looks up movements by ID", () => {
    expect(getMovement("air_squat")?.name).toBe("Air Squat");
    expect(getMovement("nonexistent")).toBeUndefined();
  });

  it("throws for missing movement with getMovementOrThrow", () => {
    expect(() => getMovementOrThrow("nonexistent")).toThrow();
  });

  it("filters by modality", () => {
    const gymnastics = getMovementsByModality(Modality.Gymnastics);
    expect(gymnastics.length).toBeGreaterThan(0);
    for (const m of gymnastics) {
      expect(m.modality).toBe(Modality.Gymnastics);
    }
  });

  it("filters by Movement Pattern", () => {
    const pushMovements = getMovementsByMovementPattern(MovementPattern.Push);
    expect(pushMovements.length).toBeGreaterThan(0);
    for (const m of pushMovements) {
      expect(m.movementPatterns).toContain(MovementPattern.Push);
    }
  });

  it("filters by equipment", () => {
    const dbOnly = getMovementsByEquipment([Equipment.Dumbbell]);
    expect(dbOnly.length).toBeGreaterThan(0);
    for (const m of dbOnly) {
      expect(
        m.equipment.every(
          (e) => e === Equipment.None || e === Equipment.Dumbbell
        )
      ).toBe(true);
    }
  });

  it("covers all four modalities", () => {
    for (const modality of Object.values(Modality)) {
      const movements = getMovementsByModality(modality);
      expect(movements.length).toBeGreaterThan(0);
    }
  });
});
