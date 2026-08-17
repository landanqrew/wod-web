import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { workouts } from "./schema";

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
