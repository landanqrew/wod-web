import { z } from "zod";
import { WorkoutFormat, ScoreType, SessionBlockType } from "@/lib/domain/models/workout";
import { Sex } from "@/lib/domain/models/athlete";
import { Equipment } from "@/lib/domain/models/equipment";
import { Joint, Modality, MovementPattern, Muscle } from "@/lib/domain/models/body";
import { DifficultyTier } from "@/lib/domain/models/movement";
import { MembershipRole } from "@/lib/domain/models/gym";
import {
  ImpedimentCategory,
  ImpedimentSeverity,
} from "@/lib/domain/models/impediment";

const enumOf = <T extends Record<string, string>>(e: T) =>
  z.enum(Object.values(e) as [string, ...string[]]);

export const prescriptionSchema = z.object({
  movementId: z.string().min(1),
  reps: z.number().int().nonnegative().optional(),
  load: z.number().nonnegative().optional(),
  distance: z.number().nonnegative().optional(),
  duration: z.number().nonnegative().optional(),
  calories: z.number().nonnegative().optional(),
  notes: z.string().max(400).optional(),
});

export const assignedWorkoutOverrideSchema = z
  .object({
    movementIndex: z.number().int().nonnegative().max(19),
    movementId: z.string().min(1).optional(),
    reps: z.number().int().nonnegative().max(10_000).optional(),
    load: z.number().nonnegative().max(2_000).optional(),
    duration: z.number().int().nonnegative().max(86_400).optional(),
  })
  .refine(
    ({ movementId, reps, load, duration }) =>
      movementId !== undefined ||
      reps !== undefined ||
      load !== undefined ||
      duration !== undefined,
    { message: "At least one override is required" },
  );

export const promoteLoadAdjustmentSchema = z.object({
  classSessionId: z.string().min(1),
  movementIndex: z.number().int().nonnegative().max(19),
  reason: z.enum(["capability", "injury"]),
  reviewAfterSessions: z.number().int().min(1).max(20).default(5),
});

export const workoutSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120),
  format: enumOf(WorkoutFormat),
  movements: z.array(prescriptionSchema).max(20),
  timeCap: z.number().int().positive().max(240).optional(),
  rounds: z.number().int().positive().max(100).optional(),
  workInterval: z.number().int().positive().optional(),
  restInterval: z.number().int().nonnegative().optional(),
  emomMinutes: z.number().int().positive().max(120).optional(),
  scoreType: enumOf(ScoreType),
  description: z.string().max(1000).optional(),
  isBenchmark: z.boolean(),
  estimatedDuration: z.number().int().positive().max(300).optional(),
});

const programmedPrescriptionSchema = prescriptionSchema.extend({
  rxLoad: z
    .object({
      male: z.number().nonnegative().max(2000),
      female: z.number().nonnegative().max(2000),
    })
    .optional(),
});

const programmedFormatFields: Record<
  WorkoutFormat,
  Array<"timeCap" | "rounds" | "workInterval" | "restInterval" | "emomMinutes">
> = {
  [WorkoutFormat.AMRAP]: ["timeCap"],
  [WorkoutFormat.EMOM]: ["emomMinutes", "rounds", "workInterval"],
  [WorkoutFormat.ForTime]: ["timeCap"],
  [WorkoutFormat.RoundsForTime]: ["rounds", "timeCap"],
  [WorkoutFormat.Tabata]: ["rounds", "workInterval", "restInterval"],
  [WorkoutFormat.Interval]: ["rounds", "workInterval", "restInterval"],
  [WorkoutFormat.Strength]: ["rounds"],
  [WorkoutFormat.Chipper]: ["timeCap"],
  [WorkoutFormat.Ladder]: ["timeCap"],
};

export const programmedWorkoutSchema = workoutSchema
  .extend({
    movements: z.array(programmedPrescriptionSchema).min(1).max(20),
  })
  .superRefine((workout, context) => {
    const required: Partial<
      Record<WorkoutFormat, Array<keyof typeof workout>>
    > = {
      [WorkoutFormat.AMRAP]: ["timeCap"],
      [WorkoutFormat.EMOM]: ["emomMinutes"],
      [WorkoutFormat.RoundsForTime]: ["rounds"],
      [WorkoutFormat.Tabata]: ["workInterval", "restInterval"],
      [WorkoutFormat.Interval]: ["workInterval", "restInterval"],
    };
    for (const field of required[workout.format as WorkoutFormat] ?? []) {
      if (workout[field] === undefined) {
        context.addIssue({
          code: "custom",
          path: [field],
          message: `${String(field)} is required for ${workout.format}`,
        });
      }
    }

    const allowed = new Set(
      programmedFormatFields[workout.format as WorkoutFormat] ?? [],
    );
    for (const field of [
      "timeCap",
      "rounds",
      "workInterval",
      "restInterval",
      "emomMinutes",
    ] as const) {
      if (!allowed.has(field) && workout[field] !== undefined) {
        context.addIssue({
          code: "custom",
          path: [field],
          message: `${field} does not apply to ${workout.format}`,
        });
      }
    }
  });

export const generateOptionsSchema = z
  .object({
    format: enumOf(WorkoutFormat),
    movementCount: z.number().int().min(1).max(10).optional(),
    modalities: z.array(enumOf(Modality)).optional(),
    movementPatterns: z.array(enumOf(MovementPattern)).optional(),
    timeCap: z.number().int().min(1).max(120).optional(),
    rounds: z.number().int().min(1).max(50).optional(),
    emomMinutes: z.number().int().min(1).max(90).optional(),
    excludeMovements: z.array(z.string()).optional(),
  })
  .superRefine((options, context) => {
    const allowed = new Set(
      programmedFormatFields[options.format as WorkoutFormat] ?? [],
    );
    for (const field of ["timeCap", "rounds", "emomMinutes"] as const) {
      if (!allowed.has(field) && options[field] !== undefined) {
        context.addIssue({
          code: "custom",
          path: [field],
          message: `${field} does not apply to ${options.format}`,
        });
      }
    }
  });

export const movementResultSchema = z.object({
  movementId: z.string().min(1),
  load: z.number().nonnegative().max(2000).optional(),
  reps: z.number().int().nonnegative().max(10000).optional(),
  rx: z.boolean(),
});

export const logResultSchema = z.object({
  /** Persist the workout first when logging something freshly generated. */
  workout: workoutSchema.optional(),
  workoutId: z.string().min(1),
  performedAt: z.string().min(4),
  scoreType: enumOf(ScoreType),
  timeSeconds: z.number().int().nonnegative().max(86_400).optional(),
  roundsCompleted: z.number().int().nonnegative().max(1000).optional(),
  partialReps: z.number().int().nonnegative().max(1000).optional(),
  peakLoad: z.number().int().nonnegative().max(2000).optional(),
  totalReps: z.number().int().nonnegative().max(100_000).optional(),
  totalCalories: z.number().int().nonnegative().max(10_000).optional(),
  totalDistance: z.number().int().nonnegative().max(200_000).optional(),
  rpe: z.number().min(1).max(10).optional(),
  rx: z.boolean(),
  scalingTier: enumOf(DifficultyTier).optional(),
  movementResults: z.array(movementResultSchema).max(20),
  notes: z.string().max(2000).optional(),
});

const localDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use an ISO local date (YYYY-MM-DD)")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, "Use a valid local date");

export const impedimentInputSchema = z
  .object({
    category: enumOf(ImpedimentCategory),
    severity: enumOf(ImpedimentSeverity),
    affectedMuscles: z.array(enumOf(Muscle)).max(24),
    affectedJoints: z.array(enumOf(Joint)).max(24),
    description: z.string().max(400).default(""),
    startDate: localDateSchema,
    endDate: localDateSchema.optional(),
    trimester: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
    weeksPostpartum: z.number().int().min(0).max(200).optional(),
  })
  .superRefine(({ startDate, endDate }, context) => {
    if (endDate !== undefined && endDate < startDate) {
      context.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "End date cannot be before start date",
      });
    }
  });

export const onboardingSchema = z.object({
  name: z.string().min(1).max(80),
  sex: enumOf(Sex),
  equipment: z.array(enumOf(Equipment)).min(1),
  preferredDuration: z.number().int().min(10).max(180),
  framework: z.string().max(40).optional(),
  impediments: z.array(impedimentInputSchema).max(6).default([]),
});

export const gymFloorEntrySchema = z.object({
  equipment: enumOf(Equipment).refine(
    (equipment) => equipment !== Equipment.None,
    "Bodyweight is not floor equipment",
  ),
  stationCount: z.number().int().positive().max(10_000).optional(),
});

export const gymInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  recoveryWindowHours: z.number().int().min(0).max(720).default(48),
  floor: z
    .array(gymFloorEntrySchema)
    .max(Object.values(Equipment).length)
    .refine(
      (entries) =>
        new Set(entries.map(({ equipment }) => equipment)).size ===
        entries.length,
      "Each equipment type can appear only once",
    ),
});

export const membershipGrantSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: z.enum([MembershipRole.Coach, MembershipRole.Member]),
});

const weeklyClassTimeSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  localTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
});

export const gymClassInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  coachAthleteId: z.string().min(1),
  weeklyTimes: z
    .array(weeklyClassTimeSchema)
    .min(1)
    .max(7)
    .refine(
      (times) => new Set(times.map(({ dayOfWeek }) => dayOfWeek)).size === times.length,
      "A Class can meet only once per weekday",
    ),
  timeZone: z.string().refine((timeZone) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone }).format();
      return true;
    } catch {
      return false;
    }
  }, "Use a valid IANA time zone"),
  capacity: z.number().int().positive().max(10_000),
});

export const sessionBlockSchema = z.object({
  type: enumOf(SessionBlockType),
  durationMinutes: z.number().int().positive().max(180),
  workout: workoutSchema.optional(),
  notes: z.string().max(2000).optional(),
});

export const saveSessionSchema = z.object({
  date: z.string().min(4),
  blocks: z.array(sessionBlockSchema).max(10),
  totalDurationMinutes: z.number().int().positive().max(300),
  notes: z.string().max(2000).optional(),
});

export type LogResultInput = z.infer<typeof logResultSchema>;
export type OnboardingInput = z.infer<typeof onboardingSchema>;
export type GenerateOptionsInput = z.infer<typeof generateOptionsSchema>;
export type SaveSessionInput = z.infer<typeof saveSessionSchema>;
export type GymInput = z.infer<typeof gymInputSchema>;
export type MembershipGrantInput = z.infer<typeof membershipGrantSchema>;
export type GymClassInput = z.infer<typeof gymClassInputSchema>;
