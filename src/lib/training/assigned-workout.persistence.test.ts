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
  programmedWorkouts,
  reservations,
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
import { ensureAssignedWorkoutsForAthlete } from "./assigned-workout";
import {
  cancelReservationForAthlete,
  reserveClassSessionForAthlete,
  reserveClassSessionForAthleteInTransaction,
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
    {
      movementId: "back_squat",
      reps: 5,
      rxLoad: { male: 225, female: 155 },
      notes: "Coach-prescribed tempo",
    },
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
    const expiredConstraints = buildInjuryConstraints(
      { muscles: [], joints: [Joint.Shoulders] },
      ImpedimentSeverity.Severe,
    );
    await db.insert(impediments).values({
      id: newId("imp"),
      athleteId: memberAthleteId,
      category: ImpedimentCategory.AcuteInjury,
      severity: ImpedimentSeverity.Severe,
      affectedMuscles: [],
      affectedJoints: [Joint.Shoulders],
      description: "Old shoulder issue",
      startDate: "2026-01-01",
      endDate: "2026-02-01",
      constraints: expiredConstraints,
    });
    await db.insert(loadAdjustments).values([
      {
        id: newId("load_adjustment"),
        athleteId: memberAthleteId,
        movementId: "bench_press",
        ratio: "0.75",
      },
      {
        id: newId("load_adjustment"),
        athleteId: memberAthleteId,
        movementId: "bench_press",
        ratio: "0.25",
        revokedAt: new Date("2027-01-01T00:00:00Z"),
      },
      {
        id: newId("load_adjustment"),
        athleteId: memberAthleteId,
        movementId: "deadlift",
        ratio: "0.10",
      },
    ]);

    const legacyReservationId = newId("reservation");
    await db.insert(reservations).values({
      id: legacyReservationId,
      classSessionId: sessions[0].id,
      athleteId: memberAthleteId,
    });
    await db.insert(programmedWorkouts).values({
      id: newId("programmed_workout"),
      classSessionId: sessions[0].id,
      workout,
      programmedByAthleteId: ownerAthleteId,
    });
    expect(
      await db
        .select()
        .from(assignedWorkouts)
        .where(eq(assignedWorkouts.reservationId, legacyReservationId)),
    ).toHaveLength(0);
    await ensureAssignedWorkoutsForAthlete(memberAthleteId);
    const [lazyBackfill] = await db
      .select()
      .from(assignedWorkouts)
      .where(eq(assignedWorkouts.reservationId, legacyReservationId));
    expect(lazyBackfill).toBeDefined();
    await db
      .delete(assignedWorkouts)
      .where(eq(assignedWorkouts.reservationId, legacyReservationId));
    await expect(
      reserveClassSessionForAthlete(
        sessions[0].id,
        memberAthleteId,
        beforeSession,
      ),
    ).resolves.toBe(legacyReservationId);
    await expect(
      getAssignedWorkoutForAthlete(sessions[0].id, memberAthleteId),
    ).resolves.toMatchObject({ reservationId: legacyReservationId });

    await programGymDay(gymId, ownerAthleteId, "2027-03-01", workout);
    const deferred = await getAssignedWorkoutForAthlete(
      sessions[1].id,
      memberAthleteId,
    );
    expect(deferred).toMatchObject({ reservationId: deferredReservationId });
    expect(deferred?.workout.movements[0].movementId).toBe("back_extension");
    expect(deferred?.workout.movements[1].load).toBe(40);
    expect(deferred?.provenance).toMatchObject([
      { movementId: "adjusted", reps: "programmed", notes: "programmed" },
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
    expect(immediateReservationId).toBe(legacyReservationId);
    await expect(
      getAssignedWorkoutForAthlete(sessions[0].id, memberAthleteId),
    ).resolves.toMatchObject({ reservationId: immediateReservationId });

    const oldAssignedId = deferred!.id;
    await expect(
      cancelReservationForAthlete(sessions[1].id, memberAthleteId),
    ).resolves.toEqual({
      cancelled: false,
      requiresAssignedWorkoutConfirmation: true,
    });
    await expect(
      getAssignedWorkoutForAthlete(sessions[1].id, memberAthleteId),
    ).resolves.toMatchObject({ id: oldAssignedId });
    await expect(
      cancelReservationForAthlete(sessions[1].id, memberAthleteId, true),
    ).resolves.toEqual({ cancelled: true, discardedAssignedWorkout: true });
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

    const concurrentClassId = await createClassForOwner(
      gymId,
      ownerAthleteId,
      {
        name: "Concurrent noon",
        coachAthleteId: ownerAthleteId,
        weeklyTimes: [{ dayOfWeek: 1, localTime: "12:00" }],
        timeZone: "America/Chicago",
        capacity: 20,
      },
      { startDate: "2027-03-08", endDate: "2027-03-08" },
    );
    const [concurrentSession] = await getClassSessionsForGym(
      gymId,
      ownerAthleteId,
      [concurrentClassId],
    );
    let releaseReservation: (() => void) | undefined;
    const reservationCanCommit = new Promise<void>((resolve) => {
      releaseReservation = resolve;
    });
    let reservationInserted: (() => void) | undefined;
    const reservationIsInserted = new Promise<void>((resolve) => {
      reservationInserted = resolve;
    });
    const concurrentReservation = db.transaction(async (tx) => {
      await reserveClassSessionForAthleteInTransaction(
        tx,
        concurrentSession.id,
        memberAthleteId,
        beforeSession,
      );
      reservationInserted?.();
      await reservationCanCommit;
    });
    await reservationIsInserted;
    const concurrentProgramming = programGymDay(
      gymId,
      ownerAthleteId,
      "2027-03-08",
      workout,
    );
    const programmingState = await Promise.race([
      concurrentProgramming.then(() => "completed" as const),
      new Promise<"waiting">((resolve) =>
        setTimeout(() => resolve("waiting"), 100),
      ),
    ]);
    releaseReservation?.();
    await Promise.all([concurrentReservation, concurrentProgramming]);
    expect(programmingState).toBe("waiting");
    await expect(
      getAssignedWorkoutForAthlete(concurrentSession.id, memberAthleteId),
    ).resolves.toMatchObject({
      workout: expect.objectContaining({ name: workout.name }),
    });
  });
});
