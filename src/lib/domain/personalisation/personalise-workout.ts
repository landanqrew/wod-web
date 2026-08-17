import { Sex, type Athlete } from "../models/athlete";
import type { MovementPrescription, Workout } from "../models/workout";
import { getMovement } from "../movements/library";
import { mergeConstraints } from "../scaling/constraint-engine";
import { findSubstitution } from "../scaling/substitution";

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
    if (!result.replacement) return { ...prescription };

    const personalised: MovementPrescription = {
      ...prescription,
      movementId: result.replacement.id,
      movement: result.replacement,
    };

    const substituted = result.replacement.id !== prescription.movementId;
    if (substituted) {
      if (result.replacement.loadType === "weighted") {
        const defaultLoad =
          context.sex === Sex.Male
            ? result.replacement.defaultLoadMale
            : result.replacement.defaultLoadFemale;
        personalised.load =
          defaultLoad === undefined
            ? undefined
            : Math.round(defaultLoad * result.loadScale);
      } else {
        personalised.load = undefined;
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
