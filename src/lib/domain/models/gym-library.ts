import type { Workout } from "./workout";
import type { WorkoutResult } from "./workout-result";

export interface GymLibraryWorkout {
  workout: Workout;
  lastRunAt: string | null;
  programmedRunCount: number;
  results: WorkoutResult[];
}
