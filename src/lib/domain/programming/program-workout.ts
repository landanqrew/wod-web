import { Modality, MovementPattern, type Muscle } from "../models/body";
import {
  Equipment,
  type EquipmentInventory,
} from "../models/equipment";
import type { Movement } from "../models/movement";
import { ScoreType, WorkoutFormat, type Workout } from "../models/workout";
import { getAllMovements } from "../movements/library";
import { createProgrammedMovementPrescription } from "../prescription";
import { filterAllowedMovements } from "../scaling";

export interface ProgrammingFloor {
  availableEquipment: EquipmentInventory;
  stationCounts?: Partial<Record<Equipment, number>>;
}

export interface ProgrammingContext {
  floor: ProgrammingFloor;
  avoidedMuscles: ReadonlySet<Muscle>;
}

export interface ProgramOptions {
  format: WorkoutFormat;
  movementCount?: number;
  modalities?: Modality[];
  movementPatterns?: MovementPattern[];
  timeCap?: number;
  rounds?: number;
  emomMinutes?: number;
  /** Explicit calorie prescription; useful for compatibility or coach intent. */
  calorieTarget?: number;
  excludeMovements?: string[];
}

const FORMAT_DEFAULTS: Record<
  WorkoutFormat,
  {
    movementCount: number;
    timeCap?: number;
    rounds?: number;
    emomMinutes?: number;
    workInterval?: number;
    restInterval?: number;
  }
> = {
  [WorkoutFormat.AMRAP]: { movementCount: 3, timeCap: 12 },
  [WorkoutFormat.EMOM]: { movementCount: 3, emomMinutes: 12 },
  [WorkoutFormat.ForTime]: { movementCount: 3, timeCap: 15 },
  [WorkoutFormat.RoundsForTime]: {
    movementCount: 3,
    rounds: 5,
    timeCap: 20,
  },
  [WorkoutFormat.Tabata]: {
    movementCount: 4,
    rounds: 8,
    workInterval: 20,
    restInterval: 10,
  },
  [WorkoutFormat.Interval]: {
    movementCount: 2,
    rounds: 5,
    workInterval: 60,
    restInterval: 60,
  },
  [WorkoutFormat.Strength]: { movementCount: 1 },
  [WorkoutFormat.Chipper]: { movementCount: 6, timeCap: 25 },
  [WorkoutFormat.Ladder]: { movementCount: 2, timeCap: 15 },
};

const TIME_CAP_FORMATS = new Set<WorkoutFormat>([
  WorkoutFormat.AMRAP,
  WorkoutFormat.ForTime,
  WorkoutFormat.RoundsForTime,
  WorkoutFormat.Chipper,
  WorkoutFormat.Ladder,
]);
const ROUND_FORMATS = new Set<WorkoutFormat>([
  WorkoutFormat.EMOM,
  WorkoutFormat.RoundsForTime,
  WorkoutFormat.Tabata,
  WorkoutFormat.Interval,
  WorkoutFormat.Strength,
]);

/** Produce a Workout for a floor without using any Athlete data. */
export function programWorkout(
  context: ProgrammingContext,
  options: ProgramOptions,
): Workout {
  const defaults = FORMAT_DEFAULTS[options.format];
  const movementCount = options.movementCount ?? defaults.movementCount;
  const availableEquipment = new Set(
    [...context.floor.availableEquipment].filter((equipment) => {
      const stations = context.floor.stationCounts?.[equipment];
      return stations === undefined || stations > 0;
    }),
  );
  let available = filterAllowedMovements(
    getAllMovements(),
    null,
    availableEquipment,
  );

  if (context.avoidedMuscles.size > 0) {
    available = available.filter((movement) =>
      [...movement.primaryMuscles, ...movement.secondaryMuscles].every(
        (muscle) => !context.avoidedMuscles.has(muscle),
      ),
    );
  }

  if (options.excludeMovements?.length) {
    const excluded = new Set(options.excludeMovements);
    available = available.filter((movement) => !excluded.has(movement.id));
  }

  if (options.modalities?.length) {
    const modalities = new Set(options.modalities);
    const filtered = available.filter((movement) =>
      modalities.has(movement.modality),
    );
    if (filtered.length >= movementCount) available = filtered;
  }

  if (options.movementPatterns?.length) {
    const patterns = new Set(options.movementPatterns);
    const preferred = available.filter((movement) =>
      movement.movementPatterns.some((pattern) => patterns.has(pattern)),
    );
    if (preferred.length >= movementCount) available = preferred;
  }

  const selected = selectDiverseMovements(available, movementCount);

  return {
    id: generateId(),
    name: formatWorkoutName(options.format, selected),
    format: options.format,
    movements: selected.map((movement) =>
      createProgrammedMovementPrescription(
        movement,
        options.format,
        options.calorieTarget,
      ),
    ),
    timeCap: TIME_CAP_FORMATS.has(options.format)
      ? options.timeCap ?? defaults.timeCap
      : undefined,
    rounds: ROUND_FORMATS.has(options.format)
      ? options.rounds ?? defaults.rounds
      : undefined,
    emomMinutes:
      options.format === WorkoutFormat.EMOM
        ? options.emomMinutes ?? defaults.emomMinutes
        : undefined,
    workInterval: defaults.workInterval,
    restInterval: defaults.restInterval,
    scoreType: getScoreType(options.format),
    isBenchmark: false,
    estimatedDuration: estimateDuration(options),
  };
}

function selectDiverseMovements(pool: Movement[], count: number): Movement[] {
  if (pool.length <= count) return [...pool];

  const byModality = new Map<Modality, Movement[]>();
  for (const movement of pool) {
    const group = byModality.get(movement.modality) ?? [];
    group.push(movement);
    byModality.set(movement.modality, group);
  }

  const modalities = [...byModality.keys()];
  const selected: Movement[] = [];
  const usedIds = new Set<string>();
  let modalityIndex = 0;

  while (selected.length < count) {
    const modality = modalities[modalityIndex % modalities.length];
    const candidates = (byModality.get(modality) ?? []).filter(
      (movement) => !usedIds.has(movement.id),
    );
    if (candidates.length > 0) {
      const movement =
        candidates[Math.floor(Math.random() * candidates.length)];
      selected.push(movement);
      usedIds.add(movement.id);
    }
    modalityIndex += 1;
    if (modalityIndex > count * modalities.length) break;
  }

  return selected;
}

function getScoreType(format: WorkoutFormat): ScoreType {
  switch (format) {
    case WorkoutFormat.AMRAP:
      return ScoreType.RoundsAndReps;
    case WorkoutFormat.ForTime:
    case WorkoutFormat.RoundsForTime:
    case WorkoutFormat.Chipper:
      return ScoreType.Time;
    case WorkoutFormat.Strength:
      return ScoreType.Load;
    case WorkoutFormat.Tabata:
      return ScoreType.Reps;
    default:
      return ScoreType.None;
  }
}

function generateId(): string {
  return `wod_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function formatWorkoutName(format: WorkoutFormat, movements: Movement[]): string {
  const movementNames = movements.slice(0, 3).map((movement) => movement.name);
  const suffix = movements.length > 3 ? " + more" : "";
  return `${format.toUpperCase()}: ${movementNames.join(", ")}${suffix}`;
}

function estimateDuration(options: ProgramOptions): number {
  const defaults = FORMAT_DEFAULTS[options.format];
  if (options.timeCap) return options.timeCap;
  if (options.emomMinutes) return options.emomMinutes;
  if (defaults.timeCap) return defaults.timeCap;
  if (defaults.emomMinutes) return defaults.emomMinutes;
  return 15;
}
