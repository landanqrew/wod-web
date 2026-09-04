import { createMovementPrescription } from "@/lib/domain/prescription";
import type { Sex } from "@/lib/domain/models/athlete";
import type { Movement } from "@/lib/domain/models/movement";
import type { MovementPrescription, Workout } from "@/lib/domain/models/workout";
import { getMovement } from "@/lib/domain/movements";
import { formatLabel } from "@/lib/format";

/** Replace one movement while retaining a compatible quantity and clearing stale fields. */
export function replaceWorkoutMovement(
  workout: Workout,
  index: number,
  replacement: Movement,
  sex: Sex,
): Workout {
  const current = workout.movements[index];
  if (!current) return workout;

  const next = createMovementPrescription(replacement, workout.format, sex);
  preserveCompatibleQuantity(current, next, replacement.loadType);
  const defaultLoad =
    sex === "male" ? replacement.defaultLoadMale : replacement.defaultLoadFemale;
  if (next.load === undefined && defaultLoad !== undefined) next.load = defaultLoad;
  next.notes = current.notes;

  const movements = workout.movements.map((prescription, movementIndex) =>
    movementIndex === index ? next : prescription,
  );

  return {
    ...workout,
    name: generatedWorkoutName(workout, movements),
    movements,
  };
}

function preserveCompatibleQuantity(
  current: MovementPrescription,
  next: MovementPrescription,
  loadType: Movement["loadType"],
) {
  switch (loadType) {
    case "bodyweight":
    case "weighted":
      if (current.reps !== undefined) next.reps = current.reps;
      if (loadType === "weighted" && current.load !== undefined) {
        next.load = current.load;
      }
      break;
    case "distance":
      if (current.distance !== undefined) next.distance = current.distance;
      break;
    case "duration":
      if (current.duration !== undefined) next.duration = current.duration;
      break;
    case "calories":
      if (current.calories !== undefined) next.calories = current.calories;
      break;
  }
}

function generatedWorkoutName(
  workout: Workout,
  movements: MovementPrescription[],
): string {
  if (workout.isBenchmark) return workout.name;
  const names = movements
    .slice(0, 3)
    .map(
      ({ movement, movementId }) =>
        movement?.name ?? getMovement(movementId)?.name ?? movementId,
    );
  return `${formatLabel(workout.format).toUpperCase()}: ${names.join(", ")}${
    movements.length > 3 ? " + more" : ""
  }`;
}
