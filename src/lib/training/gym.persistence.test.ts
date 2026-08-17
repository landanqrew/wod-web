import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, pool } from "../db";
import { athletes, gyms, users, workouts } from "../db/schema";
import {
  getGymForAthlete,
  getGymMembers,
  getGymsForAthlete,
  requireGymPermission,
} from "../data/gym";
import { Equipment } from "../domain/models/equipment";
import { GymPermission, MembershipRole } from "../domain/models/gym";
import { ScoreType, WorkoutFormat, type Workout } from "../domain/models/workout";
import { newId } from "../ids";
import { logResultForAthlete, upsertWorkout } from "./log";
import {
  createGymForOwner,
  grantGymMembership,
  revokeGymMembership,
  updateGymForOwner,
} from "./gym";

const userId = newId("test_user");
const athleteId = newId("test_ath");
const outsiderUserId = newId("test_user");
const outsiderAthleteId = newId("test_ath");
const workoutId = newId("wod");
let gymId: string | undefined;
let outsiderGymId: string | undefined;

beforeAll(async () => {
  await db.insert(users).values([
    {
      id: userId,
      name: "Gym Owner",
      email: `${userId}@test.local`,
    },
    {
      id: outsiderUserId,
      name: "Other Athlete",
      email: `${outsiderUserId}@test.local`,
    },
  ]);
  await db.insert(athletes).values([
    {
      id: athleteId,
      userId,
      name: "Gym Owner",
      sex: "female",
      equipment: [Equipment.Dumbbell],
    },
    {
      id: outsiderAthleteId,
      userId: outsiderUserId,
      name: "Other Athlete",
      sex: "male",
      equipment: [],
    },
  ]);
});

afterAll(async () => {
  if (gymId) await db.delete(gyms).where(eq(gyms.id, gymId));
  if (outsiderGymId) await db.delete(gyms).where(eq(gyms.id, outsiderGymId));
  await db.delete(workouts).where(eq(workouts.id, workoutId));
  await db.delete(users).where(eq(users.id, userId));
  await db.delete(users).where(eq(users.id, outsiderUserId));
  await pool.end();
});

describe("Gym floor persistence", () => {
  it("creates an owned Gym, edits its floor, and preserves solo training", async () => {
    const soloWorkout: Workout = {
      id: workoutId,
      name: "Solo workout",
      format: WorkoutFormat.AMRAP,
      movements: [{ movementId: "air_squat", reps: 10 }],
      scoreType: ScoreType.RoundsAndReps,
      isBenchmark: false,
    };
    await upsertWorkout(soloWorkout, athleteId);
    const { result } = await logResultForAthlete(athleteId, {
      workoutId,
      performedAt: new Date().toISOString(),
      scoreType: ScoreType.RoundsAndReps,
      roundsCompleted: 5,
      rx: true,
      movementResults: [],
    });

    gymId = await createGymForOwner(athleteId, {
      name: "Iron Ridge",
      floor: [
        { equipment: Equipment.Rower, stationCount: 12 },
        { equipment: Equipment.Barbell },
      ],
    });

    expect(await getGymsForAthlete(athleteId)).toEqual([
      {
        id: gymId,
        name: "Iron Ridge",
        membershipRole: MembershipRole.Owner,
        floor: expect.arrayContaining([
          { equipment: Equipment.Rower, stationCount: 12 },
          { equipment: Equipment.Barbell },
        ]),
      },
    ]);

    expect(await getGymForAthlete(gymId, outsiderAthleteId)).toBeNull();
    await expect(
      updateGymForOwner(gymId, outsiderAthleteId, {
        name: "Hijacked Gym",
        floor: [{ equipment: Equipment.Barbell, stationCount: 1 }],
      }),
    ).rejects.toThrow("Gym not found");
    await expect(
      grantGymMembership(gymId, outsiderAthleteId, {
        email: `${userId}@test.local`,
        role: MembershipRole.Member,
      }),
    ).rejects.toThrow("Gym not found");
    await expect(
      revokeGymMembership(gymId, outsiderAthleteId, athleteId),
    ).rejects.toThrow("Gym not found");

    await grantGymMembership(gymId, athleteId, {
      email: `${outsiderUserId}@test.local`,
      role: MembershipRole.Coach,
    });
    expect(await getGymForAthlete(gymId, outsiderAthleteId)).toMatchObject({
      id: gymId,
      membershipRole: MembershipRole.Coach,
    });
    await expect(
      requireGymPermission(
        gymId,
        outsiderAthleteId,
        GymPermission.Program,
      ),
    ).resolves.toBe(MembershipRole.Coach);
    await expect(
      grantGymMembership(gymId, outsiderAthleteId, {
        email: `${userId}@test.local`,
        role: MembershipRole.Member,
      }),
    ).rejects.toThrow("Gym not found");
    await expect(
      revokeGymMembership(gymId, outsiderAthleteId, athleteId),
    ).rejects.toThrow("Gym not found");
    expect(await getGymMembers(gymId, athleteId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          athleteId: outsiderAthleteId,
          role: MembershipRole.Coach,
        }),
      ]),
    );
    await expect(getGymMembers(gymId, outsiderAthleteId)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ athleteId: athleteId }),
      ]),
    );
    await expect(
      updateGymForOwner(gymId, outsiderAthleteId, {
        name: "Coach Hijack",
        floor: [],
      }),
    ).rejects.toThrow("Gym not found");

    outsiderGymId = await createGymForOwner(outsiderAthleteId, {
      name: "Second Gym",
      floor: [],
    });
    expect((await getGymsForAthlete(outsiderAthleteId)).map(({ id }) => id)).toEqual(
      expect.arrayContaining([gymId, outsiderGymId]),
    );

    await grantGymMembership(gymId, athleteId, {
      email: `${outsiderUserId}@test.local`,
      role: MembershipRole.Member,
    });
    await expect(
      requireGymPermission(
        gymId,
        outsiderAthleteId,
        GymPermission.Program,
      ),
    ).rejects.toThrow("Gym not found");
    await expect(getGymMembers(gymId, outsiderAthleteId)).rejects.toThrow(
      "Gym not found",
    );
    await expect(
      grantGymMembership(gymId, outsiderAthleteId, {
        email: `${userId}@test.local`,
        role: MembershipRole.Coach,
      }),
    ).rejects.toThrow("Gym not found");
    await expect(
      revokeGymMembership(gymId, outsiderAthleteId, athleteId),
    ).rejects.toThrow("Gym not found");

    await updateGymForOwner(gymId, athleteId, {
      name: "Iron Ridge CrossFit",
      floor: [{ equipment: Equipment.Rower, stationCount: 10 }],
    });
    expect(await getGymForAthlete(gymId, athleteId)).toEqual({
      id: gymId,
      name: "Iron Ridge CrossFit",
      membershipRole: MembershipRole.Owner,
      floor: [{ equipment: Equipment.Rower, stationCount: 10 }],
    });

    await grantGymMembership(gymId, athleteId, {
      email: `${outsiderUserId}@test.local`,
      role: MembershipRole.Coach,
    });
    await revokeGymMembership(gymId, athleteId, outsiderAthleteId);
    expect(await getGymForAthlete(gymId, outsiderAthleteId)).toBeNull();
    expect(await getGymForAthlete(gymId, athleteId)).toMatchObject({
      id: gymId,
      floor: [{ equipment: Equipment.Rower, stationCount: 10 }],
    });
    await expect(
      revokeGymMembership(gymId, athleteId, athleteId),
    ).rejects.toThrow("owner cannot be removed");

    const [storedResult] = await db.query.workoutResults.findMany({
      where: (rows, { eq: equals }) => equals(rows.id, result.id),
    });
    expect(storedResult?.workoutId).toBe(workoutId);
  });
});
