import type { Athlete } from "../models/athlete";
import type { Workout, TrainingSession, SessionBlock } from "../models/workout";
import { SessionBlockType, WorkoutFormat } from "../models/workout";
import { generateWorkout } from "./workout-generator";
import type { GenerateOptions } from "./workout-generator";
import { generateWarmUp, generateCoolDown } from "./warmup-engine";
import type { WarmUpDrill, CoolDownDrill } from "./warmup-engine";

/**
 * Options for building a full training session.
 */
export interface SessionOptions {
  /** Total target duration in minutes (default: 60) */
  totalMinutes?: number;
  /** Include warm-up block (default: true) */
  includeWarmUp?: boolean;
  /** Include cool-down block (default: true) */
  includeCoolDown?: boolean;
  /** Provide a pre-built workout instead of generating one */
  workout?: Workout;
  /** Options for generating the WOD (if no workout provided) */
  generateOptions?: GenerateOptions;
}

export interface SessionResult {
  session: TrainingSession;
  warmUpDrills: WarmUpDrill[];
  coolDownDrills: CoolDownDrill[];
}

/**
 * Build a complete training session with warm-up, WOD, and cool-down.
 *
 * Time allocation (for a 60-min session):
 * - Warm-up: ~10 min
 * - WOD: ~35-40 min (scales with total time)
 * - Cool-down: ~5-10 min
 */
export function buildSession(
  athlete: Athlete,
  options: SessionOptions = {}
): SessionResult {
  const totalMinutes = options.totalMinutes ?? 60;
  const includeWarmUp = options.includeWarmUp ?? true;
  const includeCoolDown = options.includeCoolDown ?? true;

  // Allocate time for blocks
  const warmUpMinutes = includeWarmUp ? Math.max(5, Math.round(totalMinutes * 0.15)) : 0;
  const coolDownMinutes = includeCoolDown ? Math.max(5, Math.round(totalMinutes * 0.1)) : 0;
  const wodMinutes = totalMinutes - warmUpMinutes - coolDownMinutes;

  // Get or generate the workout
  const workout =
    options.workout ??
    generateWorkout(athlete, {
      ...(options.generateOptions ?? { format: WorkoutFormat.AMRAP }),
      timeCap:
        options.generateOptions?.timeCap ?? Math.min(wodMinutes, 20),
    });

  // Generate warm-up and cool-down based on the workout's movements
  const warmUpDrills = includeWarmUp ? generateWarmUp(workout) : [];
  const coolDownDrills = includeCoolDown ? generateCoolDown(workout) : [];

  // Build session blocks
  const blocks: SessionBlock[] = [];

  if (includeWarmUp) {
    blocks.push({
      type: SessionBlockType.WarmUp,
      durationMinutes: warmUpMinutes,
      notes: formatWarmUpNotes(warmUpDrills),
    });
  }

  blocks.push({
    type: SessionBlockType.Metcon,
    durationMinutes: workout.estimatedDuration ?? wodMinutes,
    workout,
  });

  if (includeCoolDown) {
    blocks.push({
      type: SessionBlockType.CoolDown,
      durationMinutes: coolDownMinutes,
      notes: formatCoolDownNotes(coolDownDrills),
    });
  }

  const session: TrainingSession = {
    id: `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    date: new Date().toISOString().split("T")[0],
    blocks,
    totalDurationMinutes: blocks.reduce((sum, b) => sum + b.durationMinutes, 0),
  };

  return { session, warmUpDrills, coolDownDrills };
}

function formatWarmUpNotes(drills: WarmUpDrill[]): string {
  return drills
    .map((d) => {
      const note = d.notes ? ` (${d.notes})` : "";
      return `${d.name}: ${d.durationOrReps}${note}`;
    })
    .join("\n");
}

function formatCoolDownNotes(drills: CoolDownDrill[]): string {
  return drills.map((d) => `${d.name}: ${d.duration}`).join("\n");
}
