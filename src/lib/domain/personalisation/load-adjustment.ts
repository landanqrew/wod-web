import type { MovementPrescription } from "../models/workout";
import type { WorkoutResult } from "../models/workout-result";

export const DEFAULT_LOAD_ADJUSTMENT_REVIEW_SESSIONS = 5;

export interface MovementLoadAdjustment {
  movementId: string;
  ratio: number;
}

export function deriveLoadAdjustmentRatio(
  overrideLoad: number,
  libraryRxLoad: number,
): number {
  if (!(overrideLoad > 0) || !(libraryRxLoad > 0)) {
    throw new Error("Load Adjustment loads must be positive");
  }
  const ratio = overrideLoad / libraryRxLoad;
  if (ratio > 1) {
    throw new Error("Load Adjustments cannot increase load");
  }
  return Math.round(ratio * 10_000) / 10_000;
}

export function applyLoadAdjustment(
  prescription: MovementPrescription,
  adjustment: MovementLoadAdjustment,
): MovementPrescription {
  if (!(adjustment.ratio > 0) || adjustment.ratio > 1) {
    throw new Error("Load Adjustments cannot increase load");
  }
  if (
    prescription.movementId !== adjustment.movementId ||
    prescription.load === undefined
  ) {
    return { ...prescription };
  }
  return {
    ...prescription,
    load: Math.round(prescription.load * adjustment.ratio),
  };
}

export function loadAdjustmentReview(
  results: readonly WorkoutResult[],
  policy: {
    movementId: string;
    referenceLoad: number;
    createdAt: string;
    requiredCleanSessions: number;
  },
): { cleanSessionRun: number; reviewDue: boolean } {
  if (policy.requiredCleanSessions < 1) {
    throw new Error("Review run must include at least one session");
  }
  const appearances = [...results]
    .filter(
      ({ performedAt }) =>
        new Date(performedAt).getTime() >= new Date(policy.createdAt).getTime(),
    )
    .sort(
      (left, right) =>
        new Date(right.performedAt).getTime() -
        new Date(left.performedAt).getTime(),
    )
    .flatMap((result) => {
      const movement = result.movementResults.find(
        ({ movementId }) => movementId === policy.movementId,
      );
      return movement ? [movement] : [];
    });

  let cleanSessionRun = 0;
  for (const result of appearances) {
    if (
      !result.rx ||
      result.load === undefined ||
      result.load < policy.referenceLoad
    ) {
      break;
    }
    cleanSessionRun += 1;
  }
  return {
    cleanSessionRun,
    reviewDue: cleanSessionRun >= policy.requiredCleanSessions,
  };
}
