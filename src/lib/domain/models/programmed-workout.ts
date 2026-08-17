import type { Workout } from "./workout";

export interface ProgrammedWorkout {
  id: string;
  classSessionId: string;
  workout: Workout;
  sourceWorkoutId: string | null;
  programmedByAthleteId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
