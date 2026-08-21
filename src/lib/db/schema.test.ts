import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { gyms, memberships, workoutResults, workouts } from "./schema";

describe("workout authorship", () => {
  it("treats the author as nullable attribution", () => {
    const authorForeignKey = getTableConfig(workouts).foreignKeys.find((foreignKey) =>
      foreignKey.reference().columns.some((column) => column.name === "created_by")
    );

    expect(authorForeignKey?.onDelete).toBe("set null");
    expect(workouts.createdBy.notNull).toBe(false);
  });
});

describe("Gym workout ownership", () => {
  it("keeps global Workouts unowned and cascades Gym-owned library rows", () => {
    const gymForeignKey = getTableConfig(workouts).foreignKeys.find((foreignKey) =>
      foreignKey.reference().columns.some((column) => column.name === "gym_id")
    );

    expect(gymForeignKey?.onDelete).toBe("cascade");
    expect(workouts.gymId.notNull).toBe(false);
  });
});

describe("Assigned Workout result lineage", () => {
  it("retains a Result if its Assigned Workout is later removed", () => {
    const config = getTableConfig(workoutResults);
    const assignedForeignKey = getTableConfig(workoutResults).foreignKeys.find((foreignKey) =>
      foreignKey.reference().columns.some((column) => column.name === "assigned_workout_id")
    );
    expect(assignedForeignKey?.onDelete).toBe("set null");
    expect(config.indexes.find(({ config }) => config.name === "workout_results_assigned_idx")?.config.unique).toBe(
      true
    );
  });
});

describe("Gym Memberships", () => {
  it("models Athlete access independently from the Gym record", () => {
    const config = getTableConfig(memberships);

    expect(config.primaryKeys[0]?.columns.map(({ name }) => name)).toEqual(["gym_id", "athlete_id"]);
    expect(config.foreignKeys.map((key) => key.onDelete)).toEqual(["cascade", "cascade"]);
    expect("ownerAthleteId" in gyms).toBe(false);
  });
});
