import "dotenv/config";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

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
          affected_regions jsonb NOT NULL DEFAULT '[]'::jsonb,
          constraints jsonb NOT NULL
        )
      `);
      await client.query(
        `INSERT INTO impediments (affected_regions, constraints)
         VALUES ($1::jsonb, $2::jsonb)`,
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
    } finally {
      await client.query("ROLLBACK");
    }
  });
});
