import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, pool } from "../db";
import {
  assignedWorkouts,
  athletes,
  gyms,
  impediments,
  loadAdjustments,
  users,
} from "../db/schema";
import { getAssignedWorkoutForAthlete } from "../data/assigned-workout";
import { getClassSessionsForGym } from "../data/gym-class";
import { Joint } from "../domain/models/body";
import { Equipment } from "../domain/models/equipment";
import { MembershipRole } from "../domain/models/gym";
import {
  buildInjuryConstraints,
  ImpedimentCategory,
  ImpedimentSeverity,
} from "../domain/models/impediment";
import { ScoreType, WorkoutFormat, type Workout } from "../domain/models/workout";
import { newId } from "../ids";
import { createClassForOwner } from "./gym-class";
import { createGymForOwner, grantGymMembership } from "./gym";
import { programGymDay } from "./programmed-workout";
import {
  cancelReservationForAthlete,
  reserveClassSessionForAthlete,
} from "./reservation";

const ownerUserId = newId("test_user");
const ownerAthleteId = newId("test_ath");
const memberUserId = newId("test_user");
const memberAthleteId = newId("test_ath");
let gymId: string | undefined;

const workout: Workout = {
  id: newId("wod"),
  name: "Personalise me",
  format: WorkoutFormat.Strength,
  movements: [
    { movementId: "back_squat", reps: 5, rxLoad: { male: 225, female: 155 } },
    { movementId: "bench_press", reps: 5, rxLoad: { male: 100, female: 80 } },
  ],
  rounds: 5,
  scoreType: ScoreType.Load,
  isBenchmark: false,
};

beforeAll(async () => {
  await db.insert(users).values([
    { id: ownerUserId, name: "Owner", email: `${ownerUserId}@test.local` },
    { id: memberUserId, name: "Member", email: `${memberUserId}@test.local` },
  ]);
  await db.insert(athletes).values([
    { id: ownerAthleteId, userId: ownerUserId, name: "Owner", sex: "male", equipment: [] },
    { id: memberAthleteId, userId: memberUserId, name: "Member", sex: "female", equipment: [] },
  ]);
});

afterAll(async () => {
  if (gymId) await db.delete(gyms).where(eq(gyms.id, gymId));
  await db.delete(users).where(eq(users.id, ownerUserId));
  await db.delete(users).where(eq(users.id, memberUserId));
  await pool.end();
});

describe("Assigned Workout materialisation", () => {
  it("materialises whichever arrives second and belongs to the Reservation", async () => {
    gymId = await createGymForOwner(ownerAthleteId, {
      name: "Iron Ridge",
      floor: [
        { equipment: Equipment.Barbell },
        { equipment: Equipment.Plates },
        { equipment: Equipment.Bench },
        { equipment: Equipment.GHD },
      ],
    });
    await grantGymMembership(gymId, ownerAthleteId, {
      email: `${memberUserId}@test.local`,
      role: MembershipRole.Member,
    });
    const classIds = await Promise.all(
      ["06:00", "17:30"].map((localTime) =>
        createClassForOwner(
          gymId!,
          ownerAthleteId,
          {
            name: localTime,
            coachAthleteId: ownerAthleteId,
            weeklyTimes: [{ dayOfWeek: 1, localTime }],
            timeZone: "America/Chicago",
            capacity: 20,
          },
          { startDate: "2027-03-01", endDate: "2027-03-01" },
        ),
      ),
    );
    const sessions = await getClassSessionsForGym(gymId, ownerAthleteId, classIds);
    const beforeSession = new Date("2027-02-01T00:00:00Z");
    const deferredReservationId = await reserveClassSessionForAthlete(
      sessions[1].id,
      memberAthleteId,
      beforeSession,
    );
    await expect(
      getAssignedWorkoutForAthlete(sessions[1].id, memberAthleteId),
    ).resolves.toBeNull();

    const constraints = buildInjuryConstraints(
      { muscles: [], joints: [Joint.Knees] },
      ImpedimentSeverity.Moderate,
    );
    await db.insert(impediments).values({
      id: newId("imp"),
      athleteId: memberAthleteId,
      category: ImpedimentCategory.AcuteInjury,
      severity: ImpedimentSeverity.Moderate,
      affectedMuscles: [],
      affectedJoints: [Joint.Knees],
      description: "Knee rehab",
      startDate: "2027-02-01",
      constraints,
    });
    await db.insert(loadAdjustments).values({
      id: newId("load_adjustment"),
      athleteId: memberAthleteId,
      movementId: "bench_press",
      ratio: "0.75",
    });

    await programGymDay(gymId, ownerAthleteId, "2027-03-01", workout);
    const deferred = await getAssignedWorkoutForAthlete(
      sessions[1].id,
      memberAthleteId,
    );
    expect(deferred).toMatchObject({ reservationId: deferredReservationId });
    expect(deferred?.workout.movements[0].movementId).toBe("back_extension");
    expect(deferred?.workout.movements[1].load).toBe(30);
    expect(deferred?.provenance).toMatchObject([
      { movementId: "adjusted" },
      { movementId: "programmed", load: "adjusted" },
    ]);
    expect(deferred?.changes.flatMap(({ explanations }) => explanations).join(" "))
      .toContain("Load Adjustment");
    await expect(
      getAssignedWorkoutForAthlete(sessions[1].id, ownerAthleteId),
    ).rejects.toThrow("Class Session not found");
    expect(
      await reserveClassSessionForAthlete(
        sessions[1].id,
        memberAthleteId,
        beforeSession,
      ),
    ).toBe(deferredReservationId);
    await expect(
      getAssignedWorkoutForAthlete(sessions[1].id, memberAthleteId),
    ).resolves.toMatchObject({ id: deferred?.id });

    const immediateReservationId = await reserveClassSessionForAthlete(
      sessions[0].id,
      memberAthleteId,
      beforeSession,
    );
    await expect(
      getAssignedWorkoutForAthlete(sessions[0].id, memberAthleteId),
    ).resolves.toMatchObject({ reservationId: immediateReservationId });

    const oldAssignedId = deferred!.id;
    await expect(
      cancelReservationForAthlete(sessions[1].id, memberAthleteId),
    ).resolves.toEqual({ discardedAssignedWorkout: true });
    expect(
      await db
        .select()
        .from(assignedWorkouts)
        .where(eq(assignedWorkouts.id, oldAssignedId)),
    ).toHaveLength(0);

    const newReservationId = await reserveClassSessionForAthlete(
      sessions[1].id,
      memberAthleteId,
      beforeSession,
    );
    const fresh = await getAssignedWorkoutForAthlete(
      sessions[1].id,
      memberAthleteId,
    );
    expect(fresh).toMatchObject({ reservationId: newReservationId });
    expect(fresh?.id).not.toBe(oldAssignedId);
  });
});
