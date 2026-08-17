import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db, pool } from "@/lib/db";
import { impediments, users } from "@/lib/db/schema";
import { createAthleteProfile, deriveConstraints } from "./profile";
import { getAthleteById } from "@/lib/data/athlete";
import { newId } from "@/lib/ids";
import { Sex } from "@/lib/domain/models/athlete";
import { Equipment } from "@/lib/domain/models/equipment";
import { Muscle } from "@/lib/domain/models/body";
import {
  ImpedimentCategory,
  ImpedimentSeverity,
} from "@/lib/domain/models/impediment";
import { generateWorkout } from "@/lib/domain/generator/workout-generator";
import { getMovement } from "@/lib/domain/movements/library";
import { WorkoutFormat } from "@/lib/domain/models/workout";

const createdUsers: string[] = [];

afterAll(async () => {
  if (createdUsers.length) await db.delete(users).where(inArray(users.id, createdUsers));
  await pool.end();
});

async function newUser(): Promise<string> {
  const id = newId("test_user");
  await db.insert(users).values({ id, name: "Onboarding", email: `${id}@test.local` });
  createdUsers.push(id);
  return id;
}

describe("onboarding", () => {
  it("stores impediments and re-derives their constraints on read", async () => {
    const userId = await newUser();

    const athleteId = await createAthleteProfile(userId, {
      name: "Pregnant Athlete",
      sex: Sex.Female,
      equipment: [Equipment.Barbell, Equipment.Dumbbell, Equipment.PullUpBar, Equipment.Rower],
      preferredDuration: 45,
      impediments: [
        {
          category: ImpedimentCategory.Pregnancy,
          severity: ImpedimentSeverity.Moderate,
          affectedMuscles: [],
          affectedJoints: [],
          description: "Third trimester",
          startDate: "2026-06-01",
          trimester: 3,
        },
      ],
    });

    await db
      .update(impediments)
      .set({
        constraints: {
          avoidMuscles: [],
          avoidJoints: [],
          avoidTags: [],
          allowHighImpact: true,
          allowOverhead: true,
          allowInversion: true,
          allowProne: true,
          allowKipping: true,
          allowHeavyAxialLoad: true,
        },
      })
      .where(eq(impediments.athleteId, athleteId));

    const athlete = await getAthleteById(athleteId);
    expect(athlete).not.toBeNull();
    expect(athlete!.impediments).toHaveLength(1);
    expect(athlete!.impediments[0].trimester).toBe(3);
    expect(athlete!.impediments[0].constraints.allowInversion).toBe(false);
    expect(athlete!.impediments[0].constraints.maxLoadPercent).toBe(50);
    expect(athlete!.equipment.has(Equipment.Barbell)).toBe(true);

    // The round-tripped athlete still constrains generation.
    const workout = generateWorkout(athlete!, {
      format: WorkoutFormat.AMRAP,
      movementCount: 3,
    });
    for (const p of workout.movements) {
      expect(getMovement(p.movementId)!.tags).not.toContain("inverted");
    }
  });

  it("derives injury constraints from the affected body parts, not from client input", () => {
    const constraints = deriveConstraints({
      category: ImpedimentCategory.AcuteInjury,
      severity: ImpedimentSeverity.Severe,
      affectedMuscles: [Muscle.Shoulders],
      affectedJoints: [],
      description: "",
      startDate: "2026-06-01",
    });

    expect(constraints.allowOverhead).toBe(false);
    expect(constraints.allowHighImpact).toBe(false);
    expect(constraints.maxLoadPercent).toBe(0);
  });

  it("rejects a profile with no equipment", async () => {
    const userId = await newUser();
    await expect(
      createAthleteProfile(userId, {
        name: "No Gear",
        sex: Sex.Male,
        equipment: [],
        preferredDuration: 60,
        impediments: [],
      })
    ).rejects.toThrow();

    const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    expect(row).toBeDefined();
  });
});
