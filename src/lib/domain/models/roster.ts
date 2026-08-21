import type { AssignedWorkout } from "./assigned-workout";
import type { Impediment } from "./impediment";
import type { Workout } from "./workout";
import type {
  RosterMovementDiff,
  ScalingPattern,
} from "../personalisation/assigned-workout-diff";

export interface RosterAthlete {
  athleteId: string;
  athleteName: string;
  assignedWorkout: AssignedWorkout | null;
  diffs: RosterMovementDiff[];
  activeImpediments: Impediment[];
}

export interface ClassSessionRoster {
  classSessionId: string;
  programmedWorkout: Workout | null;
  athletes: RosterAthlete[];
  scalingPatterns: ScalingPattern[];
}
