import { Sex } from "../models/athlete";
import { Modality } from "../models/body";
import type { Movement } from "../models/movement";
import {
  WorkoutFormat,
  type MovementPrescription,
} from "../models/workout";

/** Build a coherent default prescription for a Movement and Workout format. */
export function createMovementPrescription(
  movement: Movement,
  format: WorkoutFormat,
  sex: Sex,
): MovementPrescription {
  const prescription: MovementPrescription = {
    movementId: movement.id,
    movement,
  };
  const defaultLoad =
    sex === Sex.Male ? movement.defaultLoadMale : movement.defaultLoadFemale;

  switch (movement.loadType) {
    case "bodyweight":
      prescription.reps = getDefaultReps(format, movement);
      break;
    case "weighted":
      prescription.reps = getDefaultReps(format, movement);
      prescription.load = defaultLoad;
      break;
    case "distance":
      prescription.distance = getDefaultDistance(format);
      break;
    case "calories":
      prescription.calories = getDefaultCalories(format, sex);
      break;
    case "duration":
      prescription.duration = getDefaultDuration();
      break;
  }

  return prescription;
}

/** Build an athlete-independent prescription for a Programmed Workout. */
export function createProgrammedMovementPrescription(
  movement: Movement,
  format: WorkoutFormat,
): MovementPrescription {
  const prescription: MovementPrescription = {
    movementId: movement.id,
    movement,
  };

  switch (movement.loadType) {
    case "bodyweight":
      prescription.reps = getDefaultReps(format, movement);
      break;
    case "weighted":
      prescription.reps = getDefaultReps(format, movement);
      if (
        movement.defaultLoadMale !== undefined &&
        movement.defaultLoadFemale !== undefined
      ) {
        prescription.rxLoad = {
          male: movement.defaultLoadMale,
          female: movement.defaultLoadFemale,
        };
      }
      break;
    case "distance":
      prescription.distance = getDefaultDistance(format);
      break;
    case "calories":
      prescription.calories = getProgrammedCalories(format);
      break;
    case "duration":
      prescription.duration = getDefaultDuration();
      break;
  }

  return prescription;
}

function getProgrammedCalories(format: WorkoutFormat): number {
  const base = 15;
  switch (format) {
    case WorkoutFormat.EMOM:
      return Math.round(base * 0.7);
    case WorkoutFormat.Chipper:
      return base * 2;
    default:
      return base;
  }
}

function getDefaultReps(format: WorkoutFormat, movement: Movement): number {
  switch (format) {
    case WorkoutFormat.AMRAP:
      return movement.modality === Modality.Weightlifting ? 10 : 15;
    case WorkoutFormat.EMOM:
      return movement.modality === Modality.Weightlifting ? 5 : 10;
    case WorkoutFormat.ForTime:
    case WorkoutFormat.RoundsForTime:
      return movement.modality === Modality.Weightlifting ? 10 : 15;
    case WorkoutFormat.Tabata:
      return 0;
    case WorkoutFormat.Strength:
      return 5;
    case WorkoutFormat.Chipper:
      return 30;
    case WorkoutFormat.Ladder:
      return 1;
    default:
      return 10;
  }
}

function getDefaultDistance(format: WorkoutFormat): number {
  switch (format) {
    case WorkoutFormat.AMRAP:
    case WorkoutFormat.EMOM:
      return 200;
    case WorkoutFormat.ForTime:
    case WorkoutFormat.RoundsForTime:
      return 400;
    case WorkoutFormat.Chipper:
      return 800;
    default:
      return 400;
  }
}

function getDefaultCalories(format: WorkoutFormat, sex: Sex): number {
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

function getDefaultDuration(): number {
  return 30;
}
