import { Sex } from "../models/athlete";
import type {
  AssignedWorkout,
  ValueProvenance,
} from "../models/assigned-workout";
import type { MovementPrescription, Workout } from "../models/workout";
import { getMovement } from "../movements/library";

export type RosterDiffFieldName =
  | "movementId"
  | "reps"
  | "load"
  | "distance"
  | "duration"
  | "calories"
  | "notes";

export interface RosterFieldDiff {
  field: RosterDiffFieldName;
  programmedValue: string | number | null;
  assignedValue: string | number | null;
  provenance: ValueProvenance;
}

export interface RosterMovementDiff {
  movementIndex: number;
  programmedMovementId: string;
  programmedMovementName: string;
  assignedMovementId: string;
  assignedMovementName: string;
  fields: RosterFieldDiff[];
  explanations: string[];
}

export interface ScalingPattern {
  programmedMovementId: string;
  programmedMovementName: string;
  athleteCount: number;
}

function resolveProgrammedPrescription(
  prescription: MovementPrescription,
  sex: Sex,
): MovementPrescription {
  const { rxLoad, ...resolved } = prescription;
  return rxLoad === undefined
    ? resolved
    : {
        ...resolved,
        load: sex === Sex.Male ? rxLoad.male : rxLoad.female,
      };
}

function value(value: string | number | undefined): string | number | null {
  return value ?? null;
}

/** Diff an Assigned Workout against the Coach prescription resolved for sex. */
export function diffAssignedWorkout(
  programmed: Workout,
  assigned: AssignedWorkout,
  sex: Sex,
): RosterMovementDiff[] {
  const resolvedProgrammed = programmed.movements.map((prescription) =>
    resolveProgrammedPrescription(prescription, sex),
  );
  const diffs: RosterMovementDiff[] = [];
  const lineCount = Math.max(
    resolvedProgrammed.length,
    assigned.workout.movements.length,
  );

  for (let movementIndex = 0; movementIndex < lineCount; movementIndex += 1) {
    const programmedLine = resolvedProgrammed[movementIndex];
    const assignedLine = assigned.workout.movements[movementIndex];
    const provenance = assigned.provenance[movementIndex];
    const programmedMovementId =
      programmedLine?.movementId ?? provenance?.programmedMovementId ?? "removed";
    const assignedMovementId = assignedLine?.movementId ?? "removed";
    const fields: RosterFieldDiff[] = [];

    if (programmedMovementId !== assignedMovementId) {
      fields.push({
        field: "movementId",
        programmedValue: programmedMovementId,
        assignedValue: assignedMovementId,
        provenance: provenance?.movementId ?? "adjusted",
      });
    }
    for (const field of [
      "reps",
      "load",
      "distance",
      "duration",
      "calories",
      "notes",
    ] as const) {
      const programmedValue = programmedLine?.[field];
      const assignedValue = assignedLine?.[field];
      if (programmedValue !== assignedValue) {
        fields.push({
          field,
          programmedValue: value(programmedValue),
          assignedValue: value(assignedValue),
          provenance: provenance?.[field] ?? "adjusted",
        });
      }
    }
    if (fields.length === 0) continue;

    diffs.push({
      movementIndex,
      programmedMovementId,
      programmedMovementName:
        getMovement(programmedMovementId)?.name ?? programmedMovementId,
      assignedMovementId,
      assignedMovementName:
        getMovement(assignedMovementId)?.name ?? assignedMovementId,
      fields,
      explanations:
        assigned.changes.find(
          (change) => change.movementIndex === movementIndex,
        )?.explanations ?? [],
    });
  }

  return diffs;
}

/** Surface repeated divergence once at least two distinct Athletes share it. */
export function summariseScalingPatterns(
  entries: readonly { athleteId: string; diffs: readonly RosterMovementDiff[] }[],
  minimumAthletes = 2,
): ScalingPattern[] {
  const athletesByMovement = new Map<string, Set<string>>();
  for (const entry of entries) {
    for (const diff of entry.diffs) {
      const athleteIds =
        athletesByMovement.get(diff.programmedMovementId) ?? new Set<string>();
      athleteIds.add(entry.athleteId);
      athletesByMovement.set(diff.programmedMovementId, athleteIds);
    }
  }

  return [...athletesByMovement]
    .filter(([, athleteIds]) => athleteIds.size >= minimumAthletes)
    .map(([programmedMovementId, athleteIds]) => ({
      programmedMovementId,
      programmedMovementName:
        getMovement(programmedMovementId)?.name ?? programmedMovementId,
      athleteCount: athleteIds.size,
    }))
    .sort((left, right) =>
      right.athleteCount === left.athleteCount
        ? left.programmedMovementName.localeCompare(right.programmedMovementName)
        : right.athleteCount - left.athleteCount,
    );
}
