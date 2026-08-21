import type { Muscle } from "../models/body";
import { WorkoutFormat, type Workout } from "../models/workout";
import { getMovement } from "../movements/library";

export interface ProgrammedWorkoutHistoryEntry {
  gymId: string;
  startsAt: Date;
  workout: Workout;
}

function loadedMuscles(workout: Workout): Set<Muscle> {
  const muscles = new Set<Muscle>();
  for (const prescription of workout.movements) {
    const movement = getMovement(prescription.movementId);
    if (!movement) continue;
    for (const muscle of [
      ...movement.primaryMuscles,
      ...movement.secondaryMuscles,
    ]) {
      muscles.add(muscle);
    }
  }
  return muscles;
}

/** Derive Gym-level recovery state from strength programming only. */
export function findRecoveringMuscles(
  history: readonly ProgrammedWorkoutHistoryEntry[],
  gymId: string,
  asOf: Date,
  windowHours: number,
): Set<Muscle> {
  if (windowHours <= 0) return new Set();
  const cutoff = asOf.getTime() - windowHours * 60 * 60 * 1_000;
  const recovering = new Set<Muscle>();

  for (const entry of history) {
    const startsAt = entry.startsAt.getTime();
    if (
      entry.gymId !== gymId ||
      entry.workout.format !== WorkoutFormat.Strength ||
      startsAt <= cutoff ||
      startsAt >= asOf.getTime()
    ) {
      continue;
    }
    for (const muscle of loadedMuscles(entry.workout)) recovering.add(muscle);
  }

  return recovering;
}

/** Return the recovering Muscles a newly programmed strength piece would load. */
export function recoveringMusclesLoadedBy(
  workout: Workout,
  recoveringMuscles: ReadonlySet<Muscle>,
): Set<Muscle> {
  if (workout.format !== WorkoutFormat.Strength) return new Set();
  return new Set(
    [...loadedMuscles(workout)].filter((muscle) =>
      recoveringMuscles.has(muscle),
    ),
  );
}
