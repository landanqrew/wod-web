import type {
  AssignedMovementProvenance,
  ValueProvenance,
} from "../models/assigned-workout";
import type { MovementPrescription, Workout } from "../models/workout";
import type { PersonalisationChange } from "./personalise-workout";

export interface ReconciliationSnapshot {
  workout: Workout;
  provenance: AssignedMovementProvenance[];
  changes: PersonalisationChange[];
}

export interface DiscardedOverrides {
  movementIndex: number;
  fields: Array<keyof AssignedMovementProvenance>;
}

export interface ReconciliationResult {
  snapshot: ReconciliationSnapshot;
  notices: string[];
  discardedOverrides: DiscardedOverrides[];
}

const VALUE_FIELDS = [
  "movementId",
  "reps",
  "load",
  "distance",
  "duration",
  "calories",
  "notes",
] as const;

type ValueField = (typeof VALUE_FIELDS)[number];

export const ATHLETE_OVERRIDE_EXPLANATION_PREFIX = "Athlete override:";
export const ATHLETE_OVERRIDE_WARNING_PREFIX = "Athlete override warning:";

function athleteOverrideExplanations(
  snapshot: ReconciliationSnapshot,
  movementIndex: number,
): string[] {
  return snapshot.changes
    .filter((change) => change.movementIndex === movementIndex)
    .flatMap((change) => change.explanations)
    .filter((explanation) =>
      explanation.startsWith(ATHLETE_OVERRIDE_EXPLANATION_PREFIX),
    );
}

function appendExplanation(
  changes: PersonalisationChange[],
  movementIndex: number,
  programmedMovementId: string,
  personalisedMovementId: string,
  explanation: string,
) {
  const existing = changes.find(
    (change) => change.movementIndex === movementIndex,
  );
  if (existing) {
    if (!existing.explanations.includes(explanation)) {
      existing.explanations.push(explanation);
    }
    return;
  }
  changes.push({
    movementIndex,
    originalMovementId: programmedMovementId,
    personalisedMovementId,
    explanations: [explanation],
  });
}

function programmedIdentity(
  snapshot: ReconciliationSnapshot,
  movementIndex: number,
): string | undefined {
  return (
    snapshot.provenance[movementIndex]?.programmedMovementId ??
    snapshot.changes.find((change) => change.movementIndex === movementIndex)
      ?.originalMovementId ??
    snapshot.workout.movements[movementIndex]?.movementId
  );
}

function copyOverride(
  field: ValueField,
  current: MovementPrescription,
  next: MovementPrescription,
) {
  const value = current[field];
  if (value === undefined) delete next[field];
  else Object.assign(next, { [field]: value });
}

export function reconcileAssignedWorkout(
  current: ReconciliationSnapshot,
  derived: ReconciliationSnapshot,
  programmedMovements: MovementPrescription[] = derived.workout.movements,
): ReconciliationResult {
  const notices: string[] = [];
  const discardedOverrides: DiscardedOverrides[] = [];
  const provenance = derived.provenance.map((entry) => ({ ...entry }));
  const movements = derived.workout.movements.map((entry) => ({ ...entry }));
  const changes = derived.changes.map((change) => ({
    ...change,
    explanations: [...change.explanations],
  }));

  const lineCount = Math.max(
    current.workout.movements.length,
    movements.length,
  );
  for (let movementIndex = 0; movementIndex < lineCount; movementIndex += 1) {
    const currentPrescription = current.workout.movements[movementIndex];
    const currentProvenance = current.provenance[movementIndex];
    if (!currentPrescription || !currentProvenance) continue;
    const overrideFields = VALUE_FIELDS.filter(
      (field) => currentProvenance[field] === "overridden",
    );
    const derivedPrescription = movements[movementIndex];
    const programmedMovementChanged =
      programmedIdentity(current, movementIndex) !==
      programmedIdentity(derived, movementIndex);
    const adjustedMovementChanged =
      currentProvenance.movementId !== "overridden" &&
      currentPrescription.movementId !== derivedPrescription?.movementId;
    if (programmedMovementChanged || adjustedMovementChanged) {
      if (overrideFields.length > 0) {
        discardedOverrides.push({ movementIndex, fields: overrideFields });
        const notice = `Movement ${movementIndex + 1} changed; discarded athlete overrides for ${overrideFields.join(", ")}`;
        notices.push(notice);
        appendExplanation(
          changes,
          movementIndex,
          programmedIdentity(derived, movementIndex) ?? "removed",
          derivedPrescription?.movementId ?? "removed",
          notice,
        );
      }
      continue;
    }
    if (!derivedPrescription) continue;

    for (const field of overrideFields) {
      copyOverride(field, currentPrescription, derivedPrescription);
      Object.assign(provenance[movementIndex], {
        [field]: "overridden" satisfies ValueProvenance,
      });
      if (
        field === "load" &&
        currentPrescription.load !== undefined &&
        programmedMovements[movementIndex]?.movementId ===
          derivedPrescription.movementId &&
        programmedMovements[movementIndex]?.load !== undefined &&
        currentPrescription.load > programmedMovements[movementIndex].load!
      ) {
        const notice = `${ATHLETE_OVERRIDE_WARNING_PREFIX} movement ${movementIndex + 1} load is heavier than programmed`;
        notices.push(notice);
        appendExplanation(
          changes,
          movementIndex,
          programmedIdentity(derived, movementIndex) ?? derivedPrescription.movementId,
          derivedPrescription.movementId,
          notice,
        );
      }
    }
    for (const explanation of athleteOverrideExplanations(current, movementIndex)) {
      appendExplanation(
        changes,
        movementIndex,
        programmedIdentity(derived, movementIndex) ?? derivedPrescription.movementId,
        derivedPrescription.movementId,
        explanation,
      );
    }
  }

  return {
    snapshot: {
      workout: { ...derived.workout, movements },
      provenance,
      changes,
    },
    notices,
    discardedOverrides,
  };
}
