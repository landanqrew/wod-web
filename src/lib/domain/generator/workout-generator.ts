import { Sex, type Athlete } from "../models/athlete";
import { WorkoutFormat, type Workout } from "../models/workout";
import { getAllMovements } from "../movements";
import { personaliseWorkout } from "../personalisation";
import {
  programWorkout,
  type ProgramOptions,
} from "../programming";
import { filterAllowedMovements, mergeConstraints } from "../scaling";

/** Backwards-compatible options for solo workout generation. */
export type GenerateOptions = ProgramOptions;

/** Run athlete-independent Programming followed by Personalisation. */
export function generateWorkout(
  athlete: Athlete,
  options: GenerateOptions,
): Workout {
  // Preserve the legacy solo selector's candidate pool. Programming itself stays
  // athlete-independent; the compatibility facade passes only Movement IDs.
  const legacyAllowedIds = new Set(
    filterAllowedMovements(
      getAllMovements(),
      mergeConstraints(athlete.impediments),
      athlete.equipment,
    ).map(({ id }) => id),
  );
  const excludedMovements = new Set(options.excludeMovements ?? []);
  for (const movement of getAllMovements()) {
    if (!legacyAllowedIds.has(movement.id)) excludedMovements.add(movement.id);
  }

  const programmedWorkout = programWorkout(
    {
      floor: { availableEquipment: athlete.equipment },
      avoidedMuscles: new Set(),
    },
    {
      ...options,
      calorieTarget: getSoloCalorieTarget(options.format, athlete.sex),
      excludeMovements: [...excludedMovements],
    },
  );

  return personaliseWorkout(programmedWorkout, athlete).workout;
}

function getSoloCalorieTarget(format: WorkoutFormat, sex: Sex): number {
  const base = sex === Sex.Male ? 15 : 12;
  switch (format) {
    case WorkoutFormat.EMOM:
      return Math.round(base * 0.7);
    case WorkoutFormat.Chipper:
      return base * 2;
    default:
      return base;
  }
}
