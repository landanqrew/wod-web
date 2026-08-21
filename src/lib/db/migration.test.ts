import "dotenv/config";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { rowToImpediment } from "./mappers";
import { EQUIPMENT_PRESETS } from "../domain/models/equipment";
import { getMovementOrThrow } from "../domain/movements/library";
import { checkMovement } from "../domain/scaling/constraint-engine";

const client = new Client({ connectionString: process.env.DATABASE_URL });

beforeAll(async () => {
  await client.connect();
});

afterAll(async () => {
  await client.end();
});

describe("three body-axis migration", () => {
  it("splits legacy mixed regions and constraint snapshots without losing values", async () => {
    await client.query("BEGIN");

    try {
      await client.query(`
        CREATE TEMP TABLE impediments (
          id text PRIMARY KEY,
          athlete_id text NOT NULL,
          category text NOT NULL,
          severity text NOT NULL,
          affected_regions jsonb NOT NULL DEFAULT '[]'::jsonb,
          description text NOT NULL DEFAULT '',
          start_date text NOT NULL,
          end_date text,
          trimester integer,
          weeks_postpartum integer,
          constraints jsonb NOT NULL,
          created_at timestamp NOT NULL DEFAULT now()
        )
      `);
      await client.query(
        `INSERT INTO impediments (
           id, athlete_id, category, severity, affected_regions,
           description, start_date, constraints
         ) VALUES (
           'legacy-shoulder', 'athlete-1', 'acute_injury', 'moderate',
           $1::jsonb, 'Legacy shoulder injury', '2026-08-01', $2::jsonb
         )`,
        [
          JSON.stringify([
            "knees",
            "quads",
            "shoulders",
            "unknown_legacy_value",
          ]),
          JSON.stringify({
            avoidRegions: ["wrists", "shoulders", "unknown_legacy_value"],
            allowHighImpact: false,
          }),
        ],
      );

      const migration = await readFile(
        new URL("../../../drizzle/0001_kind_toad_men.sql", import.meta.url),
        "utf8",
      );
      for (const statement of migration.split("--> statement-breakpoint")) {
        if (statement.trim()) await client.query(statement);
      }

      const result = await client.query<{
        affected_muscles: string[];
        affected_joints: string[];
        constraints: Record<string, unknown>;
      }>(
        `SELECT affected_muscles, affected_joints, constraints FROM impediments`,
      );

      expect(result.rows).toEqual([
        {
          affected_muscles: ["quads", "shoulders"],
          affected_joints: ["knees", "shoulders"],
          constraints: {
            allowHighImpact: false,
            avoidMuscles: ["shoulders"],
            avoidJoints: ["wrists", "shoulders"],
          },
        },
      ]);

      const mappedResult = await client.query(
        `SELECT
           id,
           athlete_id AS "athleteId",
           category,
           severity,
           affected_muscles AS "affectedMuscles",
           affected_joints AS "affectedJoints",
           description,
           start_date AS "startDate",
           end_date AS "endDate",
           trimester,
           weeks_postpartum AS "weeksPostpartum",
           constraints,
           created_at AS "createdAt"
         FROM impediments`,
      );
      const impediment = rowToImpediment(
        mappedResult.rows[0] as Parameters<typeof rowToImpediment>[0],
      );

      expect(impediment.constraints.avoidMuscles).toContain("shoulders");
      expect(impediment.constraints.avoidJoints).toContain("shoulders");
      expect(
        checkMovement(
          getMovementOrThrow("plank"),
          impediment.constraints,
          EQUIPMENT_PRESETS.fullGym,
        ).allowed,
      ).toBe(false);
    } finally {
      await client.query("ROLLBACK");
    }
  });
});

describe("Gym Membership migration", () => {
  it("backfills legacy owners before removing direct Gym ownership", async () => {
    await client.query("BEGIN");

    try {
      await client.query(`
        CREATE SCHEMA issue_13_migration;
        SET LOCAL search_path TO issue_13_migration;
        CREATE TABLE athletes (id text PRIMARY KEY);
        CREATE TABLE gyms (
          id text PRIMARY KEY,
          name text NOT NULL,
          owner_athlete_id text,
          created_at timestamp NOT NULL DEFAULT now(),
          updated_at timestamp NOT NULL DEFAULT now(),
          CONSTRAINT gyms_owner_athlete_id_athletes_id_fk
            FOREIGN KEY (owner_athlete_id) REFERENCES athletes(id) ON DELETE SET NULL
        );
        CREATE INDEX gyms_owner_athlete_idx ON gyms(owner_athlete_id);
        INSERT INTO athletes (id) VALUES ('legacy-owner');
        INSERT INTO gyms (id, name, owner_athlete_id)
        VALUES ('legacy-gym', 'Legacy Gym', 'legacy-owner');
      `);

      const migration = (
        await readFile(
          new URL("../../../drizzle/0004_icy_valkyrie.sql", import.meta.url),
          "utf8",
        )
      ).replaceAll('"public".', '"issue_13_migration".');
      for (const statement of migration.split("--> statement-breakpoint")) {
        if (statement.trim()) await client.query(statement);
      }

      const membership = await client.query(
        `SELECT gym_id, athlete_id, role FROM memberships`,
      );
      expect(membership.rows).toEqual([
        {
          gym_id: "legacy-gym",
          athlete_id: "legacy-owner",
          role: "owner",
        },
      ]);

      const legacyColumn = await client.query(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'issue_13_migration'
           AND table_name = 'gyms'
           AND column_name = 'owner_athlete_id'`,
      );
      expect(legacyColumn.rows).toEqual([]);
    } finally {
      await client.query("ROLLBACK");
    }
  });
});

describe("Class Session snapshot migration", () => {
  it("backfills historical timezone and coach attribution", async () => {
    await client.query("BEGIN");

    try {
      await client.query(`
        CREATE SCHEMA issue_14_migration;
        SET LOCAL search_path TO issue_14_migration;
        CREATE TABLE athletes (id text PRIMARY KEY);
        CREATE TABLE classes (
          id text PRIMARY KEY,
          coach_athlete_id text,
          time_zone text NOT NULL
        );
        CREATE TABLE class_sessions (
          id text PRIMARY KEY,
          class_id text NOT NULL,
          local_date text NOT NULL,
          starts_at timestamp with time zone NOT NULL,
          cancelled_at timestamp with time zone,
          created_at timestamp NOT NULL DEFAULT now()
        );
        INSERT INTO athletes (id) VALUES ('historical-coach');
        INSERT INTO classes (id, coach_athlete_id, time_zone)
        VALUES ('class-1', 'historical-coach', 'America/Chicago');
        INSERT INTO class_sessions (id, class_id, local_date, starts_at)
        VALUES ('session-1', 'class-1', '2026-03-01', '2026-03-01T12:00:00Z');
      `);

      const migration = (
        await readFile(
          new URL("../../../drizzle/0006_same_firebird.sql", import.meta.url),
          "utf8",
        )
      ).replaceAll('"public".', '"issue_14_migration".');
      for (const statement of migration.split("--> statement-breakpoint")) {
        if (statement.trim()) await client.query(statement);
      }

      const snapshots = await client.query(
        `SELECT coach_athlete_id, time_zone FROM class_sessions`,
      );
      expect(snapshots.rows).toEqual([
        {
          coach_athlete_id: "historical-coach",
          time_zone: "America/Chicago",
        },
      ]);
    } finally {
      await client.query("ROLLBACK");
    }
  });
});

describe("Gym Library migration", () => {
  it("preserves legacy Workouts while adding nullable Gym ownership", async () => {
    await client.query("BEGIN");
    try {
      await client.query(`
        CREATE SCHEMA issue_23_migration;
        SET LOCAL search_path TO issue_23_migration;
        CREATE TABLE gyms (id text PRIMARY KEY);
        CREATE TABLE workouts (id text PRIMARY KEY, name text NOT NULL);
        INSERT INTO gyms (id) VALUES ('gym-1');
        INSERT INTO workouts (id, name) VALUES ('legacy-workout', 'Legacy');
      `);
      const migration = (
        await readFile(
          new URL("../../../drizzle/0012_even_cable.sql", import.meta.url),
          "utf8",
        )
      ).replaceAll('"public".', '"issue_23_migration".');
      for (const statement of migration.split("--> statement-breakpoint")) {
        if (statement.trim()) await client.query(statement);
      }
      const legacy = await client.query(
        `SELECT id, gym_id, updated_at IS NOT NULL AS has_updated_at FROM workouts`,
      );
      expect(legacy.rows).toEqual([
        { id: "legacy-workout", gym_id: null, has_updated_at: true },
      ]);
      await client.query(
        `UPDATE workouts SET gym_id = 'gym-1' WHERE id = 'legacy-workout'`,
      );
      await client.query(`DELETE FROM gyms WHERE id = 'gym-1'`);
      expect((await client.query(`SELECT id FROM workouts`)).rows).toEqual([]);
    } finally {
      await client.query("ROLLBACK");
    }
  });
});

describe("Gym Recovery Window migration", () => {
  it("backfills the 48-hour default for an existing Gym", async () => {
    await client.query("BEGIN");

    try {
      await client.query(`
        CREATE SCHEMA issue_20_migration;
        SET LOCAL search_path TO issue_20_migration;
        CREATE TABLE gyms (
          id text PRIMARY KEY,
          name text NOT NULL,
          created_at timestamp NOT NULL DEFAULT now(),
          updated_at timestamp NOT NULL DEFAULT now()
        );
        INSERT INTO gyms (id, name) VALUES ('legacy-gym', 'Legacy Gym');
      `);

      const migration = await readFile(
        new URL(
          "../../../drizzle/0011_dapper_lenny_balinger.sql",
          import.meta.url,
        ),
        "utf8",
      );
      for (const statement of migration.split("--> statement-breakpoint")) {
        if (statement.trim()) await client.query(statement);
      }

      const result = await client.query(
        `SELECT recovery_window_hours FROM gyms WHERE id = 'legacy-gym'`,
      );
      expect(result.rows).toEqual([{ recovery_window_hours: 48 }]);
      await expect(
        client.query(
          `UPDATE gyms SET recovery_window_hours = -1 WHERE id = 'legacy-gym'`,
        ),
      ).rejects.toThrow("gyms_recovery_window_hours_check");
    } finally {
      await client.query("ROLLBACK");
    }
  });
});
