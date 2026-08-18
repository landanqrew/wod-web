import type { PersonalisationChange } from "../personalisation";
import type { Workout } from "./workout";

export type ValueProvenance = "programmed" | "adjusted" | "overridden";

export interface AssignedMovementProvenance {
  movementId: ValueProvenance;
  reps?: ValueProvenance;
  load?: ValueProvenance;
  distance?: ValueProvenance;
  duration?: ValueProvenance;
  calories?: ValueProvenance;
  notes?: ValueProvenance;
}

export interface AssignedWorkout {
  id: string;
  reservationId: string;
  workout: Workout;
  provenance: AssignedMovementProvenance[];
  changes: PersonalisationChange[];
  createdAt: Date;
  updatedAt: Date;
}
