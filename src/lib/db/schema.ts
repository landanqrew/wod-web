import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { MovementPrescription, SessionBlock } from "@/lib/domain/models/workout";
import type { MovementResult } from "@/lib/domain/models/workout-result";
import type { MovementConstraint } from "@/lib/domain/models/impediment";
import type { WeeklyClassTime } from "@/lib/domain/scheduling/expand-class-schedule";

/* ── auth (better-auth) ─────────────────────────────────────────────── */

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
});

export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verifications = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/* ── training domain ────────────────────────────────────────────────── */

export const athletes = pgTable(
  "athletes",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sex: text("sex").notNull(),
    /** Equipment slugs; hydrated into a Set by the mapper. */
    equipment: jsonb("equipment").$type<string[]>().notNull().default([]),
    preferredDuration: integer("preferred_duration"),
    framework: text("framework"),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("athletes_user_id_idx").on(t.userId)]
);

/**
 * Constraints are recomputed from the canonical fields at read time. The stored
 * snapshot is retained for migration compatibility and inspection.
 */
export const impediments = pgTable(
  "impediments",
  {
    id: text("id").primaryKey(),
    athleteId: text("athlete_id")
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    severity: text("severity").notNull(),
    affectedMuscles: jsonb("affected_muscles").$type<string[]>().notNull().default([]),
    affectedJoints: jsonb("affected_joints").$type<string[]>().notNull().default([]),
    description: text("description").notNull().default(""),
    startDate: text("start_date").notNull(),
    endDate: text("end_date"),
    trimester: integer("trimester"),
    weeksPostpartum: integer("weeks_postpartum"),
    constraints: jsonb("constraints").$type<MovementConstraint>().notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("impediments_athlete_idx").on(t.athleteId)]
);

export const workouts = pgTable(
  "workouts",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    format: text("format").notNull(),
    movements: jsonb("movements").$type<MovementPrescription[]>().notNull().default([]),
    timeCap: integer("time_cap"),
    rounds: integer("rounds"),
    workInterval: integer("work_interval"),
    restInterval: integer("rest_interval"),
    emomMinutes: integer("emom_minutes"),
    scoreType: text("score_type").notNull(),
    description: text("description"),
    isBenchmark: boolean("is_benchmark").notNull().default(false),
    /** Benchmark grouping: girl | hero | open | custom */
    benchmarkCategory: text("benchmark_category"),
    estimatedDuration: integer("estimated_duration"),
    createdBy: text("created_by").references(() => athletes.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("workouts_created_by_idx").on(t.createdBy)]
);

export const gyms = pgTable("gyms", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const memberships = pgTable(
  "memberships",
  {
    gymId: text("gym_id")
      .notNull()
      .references(() => gyms.id, { onDelete: "cascade" }),
    athleteId: text("athlete_id")
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.gymId, t.athleteId] }),
    index("memberships_athlete_idx").on(t.athleteId),
  ],
);

export const gymEquipment = pgTable(
  "gym_equipment",
  {
    gymId: text("gym_id")
      .notNull()
      .references(() => gyms.id, { onDelete: "cascade" }),
    equipment: text("equipment").notNull(),
    stationCount: integer("station_count"),
  },
  (t) => [primaryKey({ columns: [t.gymId, t.equipment] })],
);

export const gymClasses = pgTable(
  "classes",
  {
    id: text("id").primaryKey(),
    gymId: text("gym_id")
      .notNull()
      .references(() => gyms.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    coachAthleteId: text("coach_athlete_id").references(() => athletes.id, {
      onDelete: "set null",
    }),
    weeklyTimes: jsonb("weekly_times").$type<WeeklyClassTime[]>().notNull(),
    timeZone: text("time_zone").notNull(),
    capacity: integer("capacity").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("classes_gym_idx").on(t.gymId)],
);

export const classSessions = pgTable(
  "class_sessions",
  {
    id: text("id").primaryKey(),
    classId: text("class_id")
      .notNull()
      .references(() => gymClasses.id, { onDelete: "cascade" }),
    coachAthleteId: text("coach_athlete_id").references(() => athletes.id, {
      onDelete: "set null",
    }),
    localDate: text("local_date").notNull(),
    timeZone: text("time_zone").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("class_sessions_class_starts_idx").on(t.classId, t.startsAt),
    index("class_sessions_starts_idx").on(t.startsAt),
  ],
);

export const workoutResults = pgTable(
  "workout_results",
  {
    id: text("id").primaryKey(),
    athleteId: text("athlete_id")
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    workoutId: text("workout_id")
      .notNull()
      .references(() => workouts.id, { onDelete: "cascade" }),
    performedAt: timestamp("performed_at", { withTimezone: true }).notNull(),
    scoreType: text("score_type").notNull(),
    timeSeconds: integer("time_seconds"),
    roundsCompleted: integer("rounds_completed"),
    partialReps: integer("partial_reps"),
    peakLoad: integer("peak_load"),
    totalReps: integer("total_reps"),
    totalCalories: integer("total_calories"),
    totalDistance: integer("total_distance"),
    rpe: numeric("rpe", { precision: 3, scale: 1 }),
    rx: boolean("rx").notNull().default(false),
    scalingTier: text("scaling_tier"),
    movementResults: jsonb("movement_results").$type<MovementResult[]>().notNull().default([]),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("workout_results_athlete_performed_idx").on(t.athleteId, t.performedAt)]
);

export const personalRecords = pgTable(
  "personal_records",
  {
    id: text("id").primaryKey(),
    athleteId: text("athlete_id")
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    referenceId: text("reference_id").notNull(),
    referenceType: text("reference_type").notNull(),
    category: text("category").notNull(),
    value: numeric("value", { precision: 12, scale: 2 }).notNull(),
    unit: text("unit").notNull(),
    achievedAt: timestamp("achieved_at", { withTimezone: true }).notNull(),
    workoutResultId: text("workout_result_id").references(() => workoutResults.id, {
      onDelete: "set null",
    }),
    previousValue: numeric("previous_value", { precision: 12, scale: 2 }),
  },
  (t) => [index("personal_records_athlete_idx").on(t.athleteId, t.achievedAt)]
);

export const trainingSessions = pgTable(
  "training_sessions",
  {
    id: text("id").primaryKey(),
    athleteId: text("athlete_id")
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    blocks: jsonb("blocks").$type<SessionBlock[]>().notNull().default([]),
    totalDurationMinutes: integer("total_duration_minutes").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("training_sessions_athlete_idx").on(t.athleteId, t.date)]
);
