import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import {
  classSessions,
  gymClasses,
  gymEquipment,
  memberships,
  programmedWorkouts,
  reservations,
  workouts,
} from "../db/schema";
import { GymPermission } from "../domain/models/gym";
import { MembershipRole } from "../domain/models/gym";
import { Equipment } from "../domain/models/equipment";
import type { ProgramOptions } from "../domain/programming";
import { programWorkout } from "../domain/programming";
import { getMovement } from "../domain/movements/library";
import type { Workout } from "../domain/models/workout";
import { newId } from "../ids";
import { programmedWorkoutSchema } from "../validation";
import { requireGymPermission } from "../data/gym";
import { materialiseAssignedWorkout } from "./assigned-workout";

function parseProgrammedWorkout(raw: unknown): Workout {
  const parsed = programmedWorkoutSchema.parse(raw);
  for (const prescription of parsed.movements) {
    if (prescription.load !== undefined) {
      throw new Error("Programmed loads must use an Rx Pair");
    }
    const movement = getMovement(prescription.movementId);
    if (!movement) throw new Error(`Unknown Movement: ${prescription.movementId}`);
    if (movement.loadType === "weighted" && !prescription.rxLoad) {
      throw new Error("Weighted Movements require an Rx Pair");
    }
    if (movement.loadType !== "weighted" && prescription.rxLoad) {
      throw new Error("Rx Pairs apply only to weighted Movements");
    }
  }
  return parsed as Workout;
}

async function assertSourceWorkoutExists(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  sourceWorkoutId: string | null,
) {
  if (!sourceWorkoutId) return;
  const [source] = await tx
    .select({ id: workouts.id })
    .from(workouts)
    .where(eq(workouts.id, sourceWorkoutId))
    .limit(1);
  if (!source) throw new Error("Source Workout not found");
}

async function requireProgrammingMembership(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  gymId: string,
  athleteId: string,
  notFoundMessage = "Gym not found",
) {
  const [membership] = await tx
    .select({ role: memberships.role })
    .from(memberships)
    .where(
      and(
        eq(memberships.gymId, gymId),
        eq(memberships.athleteId, athleteId),
      ),
    )
    .limit(1)
    .for("key share");
  if (
    membership?.role !== MembershipRole.Owner &&
    membership?.role !== MembershipRole.Coach
  ) {
    throw new Error(notFoundMessage);
  }
}

export async function programGymDay(
  gymId: string,
  athleteId: string,
  localDate: string,
  rawWorkout: unknown,
  sourceWorkoutId: string | null = null,
): Promise<string[]> {
  return db.transaction(async (tx) => {
    await requireProgrammingMembership(tx, gymId, athleteId);
    const workout = parseProgrammedWorkout(rawWorkout);
    await assertSourceWorkoutExists(tx, sourceWorkoutId);
    const sessions = await tx
      .select({ id: classSessions.id, localDate: classSessions.localDate })
      .from(classSessions)
      .innerJoin(gymClasses, eq(gymClasses.id, classSessions.classId))
      .where(
        and(
          eq(gymClasses.gymId, gymId),
          eq(classSessions.localDate, localDate),
          isNull(classSessions.cancelledAt),
        ),
      )
      .for("update", { of: classSessions });
    if (sessions.length === 0) throw new Error("No Class Sessions found");

    const ids: string[] = [];
    for (const session of sessions) {
      const id = newId("programmed_workout");
      const [stored] = await tx
        .insert(programmedWorkouts)
        .values({
          id,
          classSessionId: session.id,
          workout,
          sourceWorkoutId,
          programmedByAthleteId: athleteId,
        })
        .onConflictDoUpdate({
          target: programmedWorkouts.classSessionId,
          set: {
            workout,
            sourceWorkoutId,
            programmedByAthleteId: athleteId,
            updatedAt: new Date(),
          },
        })
        .returning({ id: programmedWorkouts.id });
      ids.push(stored.id);
      const sessionReservations = await tx
        .select({ id: reservations.id, athleteId: reservations.athleteId })
        .from(reservations)
        .where(eq(reservations.classSessionId, session.id));
      for (const reservation of sessionReservations) {
        await materialiseAssignedWorkout(tx, {
          reservationId: reservation.id,
          athleteId: reservation.athleteId,
          gymId,
          localDate: session.localDate,
          programmedWorkout: workout,
        });
      }
    }
    return ids;
  });
}

export async function generateProgrammedWorkoutForGymDay(
  gymId: string,
  athleteId: string,
  localDate: string,
  options: ProgramOptions,
): Promise<string[]> {
  await requireGymPermission(gymId, athleteId, GymPermission.Program);
  const floorRows = await db
    .select()
    .from(gymEquipment)
    .where(eq(gymEquipment.gymId, gymId));
  const workout = programWorkout(
    {
      floor: {
        availableEquipment: new Set(
          floorRows.map(({ equipment }) => equipment as Equipment),
        ),
        stationCounts: Object.fromEntries(
          floorRows
            .filter(({ stationCount }) => stationCount !== null)
            .map(({ equipment, stationCount }) => [equipment, stationCount!]),
        ),
      },
      avoidedMuscles: new Set(),
    },
    options,
  );
  return programGymDay(gymId, athleteId, localDate, workout);
}

export async function updateProgrammedWorkoutForSession(
  classSessionId: string,
  athleteId: string,
  rawWorkout: unknown,
) {
  await db.transaction(async (tx) => {
    const [candidate] = await tx
      .select({ gymId: gymClasses.gymId })
      .from(classSessions)
      .innerJoin(gymClasses, eq(gymClasses.id, classSessions.classId))
      .where(eq(classSessions.id, classSessionId))
      .limit(1);
    if (!candidate) throw new Error("Class Session not found");
    await requireProgrammingMembership(
      tx,
      candidate.gymId,
      athleteId,
      "Class Session not found",
    );
    const workout = parseProgrammedWorkout(rawWorkout);
    const [session] = await tx
      .select({ id: classSessions.id, localDate: classSessions.localDate })
      .from(classSessions)
      .innerJoin(gymClasses, eq(gymClasses.id, classSessions.classId))
      .where(
        and(
          eq(classSessions.id, classSessionId),
          eq(gymClasses.gymId, candidate.gymId),
        ),
      )
      .limit(1)
      .for("update", { of: classSessions });
    if (!session) throw new Error("Class Session not found");

    const [updated] = await tx
      .update(programmedWorkouts)
      .set({ workout, programmedByAthleteId: athleteId, updatedAt: new Date() })
      .where(eq(programmedWorkouts.classSessionId, classSessionId))
      .returning({ id: programmedWorkouts.id });
    if (!updated) throw new Error("Programmed Workout not found");
    const sessionReservations = await tx
      .select({ id: reservations.id, athleteId: reservations.athleteId })
      .from(reservations)
      .where(eq(reservations.classSessionId, classSessionId));
    for (const reservation of sessionReservations) {
      await materialiseAssignedWorkout(tx, {
        reservationId: reservation.id,
        athleteId: reservation.athleteId,
        gymId: candidate.gymId,
        localDate: session.localDate,
        programmedWorkout: workout,
      });
    }
  });
}
