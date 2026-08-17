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
