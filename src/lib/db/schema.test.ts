import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { getTableConfig } from "drizzle-orm/pg-core";
import { gyms, memberships, workouts } from "./schema";

describe("workout authorship", () => {
  it("treats the author as nullable attribution", () => {
    const authorForeignKey = getTableConfig(workouts).foreignKeys.find(
      (foreignKey) =>
        foreignKey.reference().columns.some(
          (column) => column.name === "created_by",
        ),
    );

    expect(authorForeignKey?.onDelete).toBe("set null");
    expect(workouts.createdBy.notNull).toBe(false);
  });
});

describe("Gym Memberships", () => {
  it("models Athlete access independently from the Gym record", () => {
    const config = getTableConfig(memberships);

    expect(config.primaryKeys[0]?.columns.map(({ name }) => name)).toEqual([
      "gym_id",
      "athlete_id",
    ]);
    expect(config.foreignKeys.map((key) => key.onDelete)).toEqual([
      "cascade",
      "cascade",
    ]);
    expect("ownerAthleteId" in gyms).toBe(false);
  });

  it("backfills existing Gym owners before removing legacy ownership", async () => {
    const migration = await readFile(
      new URL("../../../drizzle/0004_icy_valkyrie.sql", import.meta.url),
      "utf8",
    );
    const backfill = migration.indexOf('INSERT INTO "memberships"');
    const dropOwner = migration.indexOf(
      'ALTER TABLE "gyms" DROP COLUMN "owner_athlete_id"',
    );

    expect(backfill).toBeGreaterThan(-1);
    expect(dropOwner).toBeGreaterThan(backfill);
  });
});
