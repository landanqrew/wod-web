import type { Athlete } from "../models/athlete";
import type { MovementPrescription, Workout } from "../models/workout";
import { getMovement } from "../movements/library";
import { mergeConstraints } from "../scaling/constraint-engine";
import { findSubstitution } from "../scaling/substitution";
import { createMovementPrescription } from "./prescription";

export type PersonalisationContext = Pick<
  Athlete,
  "sex" | "equipment" | "impediments"
>;

export interface PersonalisationChange {
  movementIndex: number;
  originalMovementId: string;
  personalisedMovementId: string;
  explanations: string[];
}

export interface PersonalisationResult {
  workout: Workout;
  changes: PersonalisationChange[];
}

export interface UnresolvedPersonalisation {
  movementIndex: number;
  movementId: string;
  explanations: string[];
}

/** Raised instead of returning a Workout that is known to be unsafe. */
export class UnableToPersonaliseWorkoutError extends Error {
  constructor(public readonly unresolved: UnresolvedPersonalisation[]) {
    super("Unable to find a safe substitute for every movement");
    this.name = "UnableToPersonaliseWorkoutError";
  }
}

/** Apply one Athlete's constraints and equipment to an existing Workout. */
export function personaliseWorkout(
  workout: Workout,
  context: PersonalisationContext,
): PersonalisationResult {
  const constraints = mergeConstraints(context.impediments);
  const changes: PersonalisationChange[] = [];

  const movements = workout.movements.map((prescription, movementIndex) => {
    const movement =
      prescription.movement ?? getMovement(prescription.movementId);
    if (!movement) return { ...prescription };

    const result = findSubstitution(
      movement,
      constraints,
      context.equipment,
    );
    if (!result.replacement) {
      throw new UnableToPersonaliseWorkoutError([
        {
          movementIndex,
          movementId: prescription.movementId,
          explanations: result.originalReasons,
        },
      ]);
    }

    const substituted = result.replacement.id !== prescription.movementId;
    const scalesExistingLoad =
      prescription.load !== undefined && result.loadScale !== 1;
    if (!substituted && !scalesExistingLoad) return { ...prescription };

    const personalised: MovementPrescription = substituted
      ? {
          ...createMovementPrescription(
            result.replacement,
            workout.format,
            context.sex,
          ),
          ...(prescription.notes !== undefined
            ? { notes: prescription.notes }
            : {}),
        }
      : { ...prescription };

    if (substituted) {
      const originalUsesReps =
        movement.loadType === "bodyweight" || movement.loadType === "weighted";
      const replacementUsesReps =
        result.replacement.loadType === "bodyweight" ||
        result.replacement.loadType === "weighted";
      if (
        originalUsesReps &&
        replacementUsesReps &&
        prescription.reps !== undefined
      ) {
        personalised.reps = prescription.reps;
      }
      if (
        movement.loadType === result.replacement.loadType &&
        movement.loadType === "distance" &&
        prescription.distance !== undefined
      ) {
        personalised.distance = prescription.distance;
      }
      if (
        movement.loadType === result.replacement.loadType &&
        movement.loadType === "calories" &&
        prescription.calories !== undefined
      ) {
        personalised.calories = prescription.calories;
      }
      if (
        movement.loadType === result.replacement.loadType &&
        movement.loadType === "duration" &&
        prescription.duration !== undefined
      ) {
        personalised.duration = prescription.duration;
      }
      if (personalised.load !== undefined && result.loadScale !== 1) {
        personalised.load = Math.round(personalised.load * result.loadScale);
      }
    } else if (prescription.load !== undefined && result.loadScale !== 1) {
      personalised.load = Math.round(prescription.load * result.loadScale);
    }

    if (substituted || personalised.load !== prescription.load) {
      changes.push({
        movementIndex,
        originalMovementId: prescription.movementId,
        personalisedMovementId: result.replacement.id,
        explanations: [
          ...result.originalReasons,
          ...result.replacementWarnings,
        ],
      });
    }

    return personalised;
  });

  return {
    workout: { ...workout, movements },
    changes,
  };
}
