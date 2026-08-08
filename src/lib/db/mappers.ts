import type { InferSelectModel } from "drizzle-orm";
import type {
  athletes,
  impediments,
  personalRecords,
  trainingSessions,
  workoutResults,
  workouts,
} from "./schema";
import type { Athlete } from "@/lib/domain/models/athlete";
import { Sex } from "@/lib/domain/models/athlete";
import type { Equipment } from "@/lib/domain/models/equipment";
import type { Impediment } from "@/lib/domain/models/impediment";
import type { ImpedimentCategory, ImpedimentSeverity } from "@/lib/domain/models/impediment";
import type { BodyRegion } from "@/lib/domain/models/body";
import type { TrainingSession, Workout } from "@/lib/domain/models/workout";
import { ScoreType, WorkoutFormat } from "@/lib/domain/models/workout";
import type { PersonalRecord, WorkoutResult } from "@/lib/domain/models/workout-result";
import type { PRCategory, PRUnit } from "@/lib/domain/models/workout-result";

type AthleteRow = InferSelectModel<typeof athletes>;
type ImpedimentRow = InferSelectModel<typeof impediments>;
type WorkoutRow = InferSelectModel<typeof workouts>;
type ResultRow = InferSelectModel<typeof workoutResults>;
type PRRow = InferSelectModel<typeof personalRecords>;
type SessionRow = InferSelectModel<typeof trainingSessions>;

/** Drop nulls so optional domain fields stay `undefined`, not `null`. */
function opt<T>(value: T | null): T | undefined {
  return value === null ? undefined : value;
}

export function rowToImpediment(row: ImpedimentRow): Impediment {
  return {
    id: row.id,
    category: row.category as ImpedimentCategory,
    severity: row.severity as ImpedimentSeverity,
    affectedRegions: row.affectedRegions as BodyRegion[],
    description: row.description,
    startDate: row.startDate,
    endDate: opt(row.endDate),
    trimester: opt(row.trimester) as 1 | 2 | 3 | undefined,
    weeksPostpartum: opt(row.weeksPostpartum),
    constraints: row.constraints,
  };
}

export function rowToAthlete(row: AthleteRow, impedimentRows: ImpedimentRow[]): Athlete {
  return {
    id: row.id,
    name: row.name,
    sex: row.sex as Sex,
    equipment: new Set(row.equipment as Equipment[]),
    impediments: impedimentRows.map(rowToImpediment),
    preferredDuration: opt(row.preferredDuration),
    framework: opt(row.framework),
    notes: opt(row.notes),
  };
}

export function rowToWorkout(row: WorkoutRow): Workout {
  return {
    id: row.id,
    name: row.name,
    format: row.format as WorkoutFormat,
    movements: row.movements,
    timeCap: opt(row.timeCap),
    rounds: opt(row.rounds),
    workInterval: opt(row.workInterval),
    restInterval: opt(row.restInterval),
    emomMinutes: opt(row.emomMinutes),
    scoreType: row.scoreType as ScoreType,
    description: opt(row.description),
    isBenchmark: row.isBenchmark,
    estimatedDuration: opt(row.estimatedDuration),
  };
}

export function workoutToRow(
  workout: Workout,
  createdBy: string | null,
  benchmarkCategory?: string
): typeof workouts.$inferInsert {
  return {
    id: workout.id,
    name: workout.name,
    format: workout.format,
    movements: workout.movements.map(({ movement: _movement, ...rest }) => rest),
    timeCap: workout.timeCap ?? null,
    rounds: workout.rounds ?? null,
    workInterval: workout.workInterval ?? null,
    restInterval: workout.restInterval ?? null,
    emomMinutes: workout.emomMinutes ?? null,
    scoreType: workout.scoreType,
    description: workout.description ?? null,
    isBenchmark: workout.isBenchmark,
    benchmarkCategory: benchmarkCategory ?? null,
    estimatedDuration: workout.estimatedDuration ?? null,
    createdBy,
  };
}

export function rowToResult(row: ResultRow): WorkoutResult {
  return {
    id: row.id,
    athleteId: row.athleteId,
    workoutId: row.workoutId,
    performedAt: row.performedAt.toISOString(),
    scoreType: row.scoreType as ScoreType,
    timeSeconds: opt(row.timeSeconds),
    roundsCompleted: opt(row.roundsCompleted),
    partialReps: opt(row.partialReps),
    peakLoad: opt(row.peakLoad),
    totalReps: opt(row.totalReps),
    totalCalories: opt(row.totalCalories),
    totalDistance: opt(row.totalDistance),
    rpe: row.rpe === null ? undefined : Number(row.rpe),
    rx: row.rx,
    scalingTier: opt(row.scalingTier),
    movementResults: row.movementResults,
    notes: opt(row.notes),
  };
}

export function resultToRow(result: WorkoutResult): typeof workoutResults.$inferInsert {
  return {
    id: result.id,
    athleteId: result.athleteId,
    workoutId: result.workoutId,
    performedAt: new Date(result.performedAt),
    scoreType: result.scoreType,
    timeSeconds: result.timeSeconds ?? null,
    roundsCompleted: result.roundsCompleted ?? null,
    partialReps: result.partialReps ?? null,
    peakLoad: result.peakLoad ?? null,
    totalReps: result.totalReps ?? null,
    totalCalories: result.totalCalories ?? null,
    totalDistance: result.totalDistance ?? null,
    rpe: result.rpe === undefined ? null : String(result.rpe),
    rx: result.rx,
    scalingTier: result.scalingTier ?? null,
    movementResults: result.movementResults,
    notes: result.notes ?? null,
  };
}

export function rowToPR(row: PRRow): PersonalRecord {
  return {
    id: row.id,
    athleteId: row.athleteId,
    referenceId: row.referenceId,
    referenceType: row.referenceType as "movement" | "workout",
    category: row.category as PRCategory,
    value: Number(row.value),
    unit: row.unit as PRUnit,
    achievedAt: row.achievedAt.toISOString(),
    workoutResultId: opt(row.workoutResultId),
    previousValue: row.previousValue === null ? undefined : Number(row.previousValue),
  };
}

export function prToRow(pr: PersonalRecord): typeof personalRecords.$inferInsert {
  return {
    id: pr.id,
    athleteId: pr.athleteId,
    referenceId: pr.referenceId,
    referenceType: pr.referenceType,
    category: pr.category,
    value: String(pr.value),
    unit: pr.unit,
    achievedAt: new Date(pr.achievedAt),
    workoutResultId: pr.workoutResultId ?? null,
    previousValue: pr.previousValue === undefined ? null : String(pr.previousValue),
  };
}

export function rowToSession(row: SessionRow): TrainingSession {
  return {
    id: row.id,
    date: row.date,
    blocks: row.blocks,
    totalDurationMinutes: row.totalDurationMinutes,
    notes: opt(row.notes),
  };
}
