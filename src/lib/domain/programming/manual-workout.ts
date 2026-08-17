import {
  ScoreType,
  WorkoutFormat,
  type Workout,
} from "../models/workout";

export function changeProgrammedWorkoutFormat(
  workout: Workout,
  format: WorkoutFormat,
): Workout {
  const next = { ...workout, format };
  delete next.timeCap;
  delete next.rounds;
  delete next.workInterval;
  delete next.restInterval;
  delete next.emomMinutes;

  switch (format) {
    case WorkoutFormat.AMRAP:
      return { ...next, timeCap: 12, scoreType: ScoreType.RoundsAndReps };
    case WorkoutFormat.EMOM:
      return { ...next, emomMinutes: 12, scoreType: ScoreType.None };
    case WorkoutFormat.ForTime:
      return { ...next, timeCap: 15, scoreType: ScoreType.Time };
    case WorkoutFormat.RoundsForTime:
      return { ...next, rounds: 5, timeCap: 20, scoreType: ScoreType.Time };
    case WorkoutFormat.Tabata:
      return {
        ...next,
        rounds: 8,
        workInterval: 20,
        restInterval: 10,
        scoreType: ScoreType.Reps,
      };
    case WorkoutFormat.Interval:
      return {
        ...next,
        rounds: 5,
        workInterval: 60,
        restInterval: 60,
        scoreType: ScoreType.None,
      };
    case WorkoutFormat.Strength:
      return { ...next, rounds: 5, scoreType: ScoreType.Load };
    case WorkoutFormat.Chipper:
      return { ...next, timeCap: 25, scoreType: ScoreType.Time };
    case WorkoutFormat.Ladder:
      return { ...next, timeCap: 15, scoreType: ScoreType.None };
  }
}

export function createManualProgrammedWorkout(): Workout {
  return changeProgrammedWorkoutFormat(
    {
      id: `programmed_${Date.now()}`,
      name: "Untitled workout",
      format: WorkoutFormat.AMRAP,
      movements: [{ movementId: "air_squat", reps: 15 }],
      scoreType: ScoreType.RoundsAndReps,
      isBenchmark: false,
    },
    WorkoutFormat.AMRAP,
  );
}
