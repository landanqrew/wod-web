import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { db, pool } from "../db";
import { athletes, gyms, loadAdjustments, users } from "../db/schema";
import { getAssignedWorkoutForAthlete } from "../data/assigned-workout";
import { getClassSessionsForGym } from "../data/gym-class";
import { Sex } from "../domain/models/athlete";
import { Equipment } from "../domain/models/equipment";
import { MembershipRole } from "../domain/models/gym";
import { ScoreType, WorkoutFormat, type Workout } from "../domain/models/workout";
import { newId } from "../ids";
import { createGymForOwner, grantGymMembership } from "./gym";
import { createClassForOwner } from "./gym-class";
import { overrideAssignedWorkoutForAthlete } from "./assigned-workout-override";
import {
  getActiveLoadAdjustmentsForAthlete,
  lockLoadAdjustmentAthleteInTransaction,
  loadAdjustmentOffer,
  promoteLoadAdjustmentForAthlete,
  revokeLoadAdjustmentForAthlete,
  revokeLoadAdjustmentForAthleteInTransaction,
} from "./load-adjustment";
import { logResultForAthlete, upsertWorkout } from "./log";
import { programGymDay, updateProgrammedWorkoutForSession } from "./programmed-workout";
import { reserveClassSessionForAthlete } from "./reservation";

const ownerUserId = newId("test_user");
const ownerAthleteId = newId("test_ath");
const memberUserId = newId("test_user");
const memberAthleteId = newId("test_ath");
const outsiderUserId = newId("test_user");
const outsiderAthleteId = newId("test_ath");
let gymId: string | undefined;

function workout(thrusterLoad: number): Workout {
  return {
    id: newId("wod"),
    name: `${thrusterLoad} lb thruster day`,
    format: WorkoutFormat.Strength,
    movements: [
      {
        movementId: "thruster",
        reps: 5,
        rxLoad: { male: thrusterLoad, female: Math.round(thrusterLoad * 0.7) },
      },
      {
        movementId: "push_press",
        reps: 8,
        rxLoad: { male: 95, female: 65 },
      },
    ],
    rounds: 5,
    scoreType: ScoreType.Load,
    isBenchmark: false,
  };
}

beforeAll(async () => {
  await db.insert(users).values([
    { id: ownerUserId, name: "Owner", email: `${ownerUserId}@test.local` },
    { id: memberUserId, name: "Member", email: `${memberUserId}@test.local` },
    { id: outsiderUserId, name: "Outsider", email: `${outsiderUserId}@test.local` },
  ]);
  await db.insert(athletes).values([
    { id: ownerAthleteId, userId: ownerUserId, name: "Owner", sex: Sex.Male, equipment: [] },
    { id: memberAthleteId, userId: memberUserId, name: "Member", sex: Sex.Male, equipment: [] },
    { id: outsiderAthleteId, userId: outsiderUserId, name: "Outsider", sex: Sex.Male, equipment: [] },
  ]);
});

afterAll(async () => {
  if (gymId) await db.delete(gyms).where(eq(gyms.id, gymId));
  await db.delete(users).where(eq(users.id, ownerUserId));
  await db.delete(users).where(eq(users.id, memberUserId));
  await db.delete(users).where(eq(users.id, outsiderUserId));
  await pool.end();
});

describe("Load Adjustment lifecycle", () => {
  it("promotes an Override, follows programmed loads, reviews, and revokes", async () => {
    gymId = await createGymForOwner(ownerAthleteId, {
      name: "Adjustment Gym",
      floor: [
        { equipment: Equipment.Barbell },
        { equipment: Equipment.Plates },
      ],
    });
    await grantGymMembership(gymId, ownerAthleteId, {
      email: `${memberUserId}@test.local`,
      role: MembershipRole.Member,
    });
    const classIds = await Promise.all(
      ["06:00", "12:00", "17:00"].map((localTime) =>
        createClassForOwner(
          gymId!,
          ownerAthleteId,
          {
            name: localTime,
            coachAthleteId: ownerAthleteId,
            weeklyTimes: [{ dayOfWeek: 1, localTime }],
            timeZone: "America/Chicago",
            capacity: 10,
          },
          { startDate: "2027-05-03", endDate: "2027-05-03" },
        ),
      ),
    );
    const sessions = await getClassSessionsForGym(gymId, ownerAthleteId, classIds);
    await programGymDay(gymId, ownerAthleteId, "2027-05-03", workout(95));
    for (const session of sessions) {
      await reserveClassSessionForAthlete(
        session.id,
        memberAthleteId,
        new Date("2027-01-01T00:00:00Z"),
      );
    }

    const offer = await overrideAssignedWorkoutForAthlete(
      sessions[0].id,
      memberAthleteId,
      { movementIndex: 0, load: 67 },
    );
    expect(offer).toMatchObject({
      movementId: "thruster",
      percent: 71,
    });
    await expect(
      overrideAssignedWorkoutForAthlete(sessions[2].id, memberAthleteId, {
        movementIndex: 0,
        load: 0,
      }),
    ).resolves.toBeNull();
    const zeroOverride = await getAssignedWorkoutForAthlete(
      sessions[2].id,
      memberAthleteId,
    );
    expect(zeroOverride?.workout.movements[0].load).toBe(0);
    expect(loadAdjustmentOffer("air_squat", 10, Sex.Male)).toBeNull();
    expect(loadAdjustmentOffer("thruster", 100, Sex.Male)).toBeNull();
    expect(loadAdjustmentOffer("thruster", 0, Sex.Male)).toBeNull();
    await expect(
      promoteLoadAdjustmentForAthlete(memberAthleteId, {
        classSessionId: sessions[0].id,
        movementIndex: 0,
        reason: "injury",
      }),
    ).resolves.toEqual({ status: "impediment_required" });

    const promoted = await promoteLoadAdjustmentForAthlete(memberAthleteId, {
      classSessionId: sessions[0].id,
      movementIndex: 0,
      reason: "capability",
      reviewAfterSessions: 5,
    });
    expect(promoted.status).toBe("created");
    const [stored] = await db
      .select()
      .from(loadAdjustments)
      .where(
        and(
          eq(loadAdjustments.athleteId, memberAthleteId),
          isNull(loadAdjustments.revokedAt),
        ),
      );
    expect(Number(stored.ratio)).toBeCloseTo(0.7053, 4);
    let assigned = await getAssignedWorkoutForAthlete(
      sessions[1].id,
      memberAthleteId,
    );
    expect(assigned?.workout.movements[0].load).toBe(67);
    await updateProgrammedWorkoutForSession(
      sessions[1].id,
      ownerAthleteId,
      workout(65),
    );
    assigned = await getAssignedWorkoutForAthlete(sessions[1].id, memberAthleteId);
    expect(assigned?.workout.movements).toMatchObject([
      { movementId: "thruster", reps: 5, load: 46 },
      { movementId: "push_press", reps: 8, load: 95 },
    ]);

    await updateProgrammedWorkoutForSession(
      sessions[1].id,
      ownerAthleteId,
      workout(135),
    );
    assigned = await getAssignedWorkoutForAthlete(sessions[1].id, memberAthleteId);
    expect(assigned?.workout.movements).toMatchObject([
      { movementId: "thruster", reps: 5, load: 95 },
      { movementId: "push_press", reps: 8, load: 95 },
    ]);
    const overridden = await getAssignedWorkoutForAthlete(
      sessions[0].id,
      memberAthleteId,
    );
    expect(overridden?.workout.movements[0]).toMatchObject({
      movementId: "thruster",
      load: 67,
    });

    const resultWorkout = workout(95);
    await upsertWorkout(resultWorkout, memberAthleteId);
    for (let index = 0; index < 5; index += 1) {
      await logResultForAthlete(memberAthleteId, {
        workoutId: resultWorkout.id,
        performedAt: `2027-05-${String(index + 4).padStart(2, "0")}T12:00:00.000Z`,
        scoreType: ScoreType.Load,
        peakLoad: 67,
        rx: true,
        movementResults: [
          { movementId: "thruster", load: 67, reps: 5, rx: true },
        ],
      });
    }
    const [active] = await getActiveLoadAdjustmentsForAthlete(memberAthleteId);
    expect(active).toMatchObject({
      movementId: "thruster",
      cleanSessionRun: 5,
      reviewDue: true,
    });
    await expect(
      revokeLoadAdjustmentForAthlete(outsiderAthleteId, active.id),
    ).rejects.toThrow("Load Adjustment not found");
    let releaseRevoke: (() => void) | undefined;
    const revokeCanCommit = new Promise<void>((resolve) => {
      releaseRevoke = resolve;
    });
    let athleteLocked: (() => void) | undefined;
    const athleteIsLocked = new Promise<void>((resolve) => {
      athleteLocked = resolve;
    });
    const blockingRevoke = db.transaction(async (tx) => {
      await lockLoadAdjustmentAthleteInTransaction(tx, memberAthleteId);
      athleteLocked?.();
      await revokeCanCommit;
      await revokeLoadAdjustmentForAthleteInTransaction(
        tx,
        memberAthleteId,
        active.id,
      );
    });
    await athleteIsLocked;
    const concurrentPromotion = promoteLoadAdjustmentForAthlete(memberAthleteId, {
      classSessionId: sessions[0].id,
      movementIndex: 0,
      reason: "capability",
    });
    const promotionState = await Promise.race([
      concurrentPromotion.then(() => "completed" as const),
      new Promise<"waiting">((resolve) =>
        setTimeout(() => resolve("waiting"), 100),
      ),
    ]);
    releaseRevoke?.();
    await Promise.all([blockingRevoke, concurrentPromotion]);
    expect(promotionState).toBe("waiting");
    const [replacement] = await getActiveLoadAdjustmentsForAthlete(
      memberAthleteId,
    );
    expect(replacement.id).not.toBe(active.id);
    await revokeLoadAdjustmentForAthlete(memberAthleteId, replacement.id);
    await expect(
      getActiveLoadAdjustmentsForAthlete(memberAthleteId),
    ).resolves.toEqual([]);
    assigned = await getAssignedWorkoutForAthlete(sessions[1].id, memberAthleteId);
    expect(assigned?.workout.movements[0].load).toBe(135);
  });
});
