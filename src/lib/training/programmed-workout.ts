import { and, eq, gt, isNull, lt, notInArray } from "drizzle-orm";
import { db } from "../db";
import {
  classSessions,
  gymClasses,
  gymEquipment,
  gyms,
  memberships,
  programmedWorkouts,
  reservations,
  workouts,
} from "../db/schema";
import { MembershipRole } from "../domain/models/gym";
import { Equipment } from "../domain/models/equipment";
import type { ProgramOptions } from "../domain/programming";
import {
  findRecoveringMuscles,
  programWorkout,
  recoveringMusclesLoadedBy,
} from "../domain/programming";
import type { Muscle } from "../domain/models/body";
import { getMovement } from "../domain/movements/library";
import type { Workout } from "../domain/models/workout";
import { newId } from "../ids";
import { programmedWorkoutSchema } from "../validation";
import { materialiseAssignedWorkout } from "./assigned-workout";

export interface ProgrammedWorkoutWriteResult {
  programmedWorkoutIds: string[];
  recoveringMuscles: Muscle[];
  warningMuscles: Muscle[];
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type TargetSession = {
  id: string;
  localDate: string;
  startsAt: Date;
};

function sortedMuscles(muscles: ReadonlySet<Muscle>): Muscle[] {
  return [...muscles].sort((left, right) => left.localeCompare(right));
}

async function lockProgrammingGymInTransaction(
  tx: Transaction,
  gymId: string,
  athleteId: string,
  notFoundMessage: string,
): Promise<number> {
  const [gym] = await tx
    .select({ recoveryWindowHours: gyms.recoveryWindowHours })
    .from(gyms)
    .where(eq(gyms.id, gymId))
    .limit(1)
    .for("update", { of: gyms });
  if (!gym) throw new Error(notFoundMessage);
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
  return gym.recoveryWindowHours;
}

async function lockTargetSessionsInTransaction(
  tx: Transaction,
  gymId: string,
  target: { localDate: string } | { classSessionId: string },
  notFoundMessage: string,
): Promise<TargetSession[]> {
  const sessions = await tx
    .select({
      id: classSessions.id,
      localDate: classSessions.localDate,
      startsAt: classSessions.startsAt,
    })
    .from(classSessions)
    .innerJoin(gymClasses, eq(gymClasses.id, classSessions.classId))
    .where(
      and(
        eq(gymClasses.gymId, gymId),
        "localDate" in target
          ? eq(classSessions.localDate, target.localDate)
          : eq(classSessions.id, target.classSessionId),
        isNull(classSessions.cancelledAt),
      ),
    )
    .for("update", { of: classSessions });
  if (sessions.length === 0) throw new Error(notFoundMessage);
  return sessions;
}

async function deriveRecoveryMusclesInTransaction(
  tx: Transaction,
  gymId: string,
  targetSessions: readonly TargetSession[],
  windowHours: number,
): Promise<Set<Muscle>> {
  if (windowHours === 0) return new Set();
  const earliestHistory = new Date(
    Math.min(...targetSessions.map(({ startsAt }) => startsAt.getTime())) -
      windowHours * 60 * 60 * 1_000,
  );
  const latestTarget = new Date(
    Math.max(...targetSessions.map(({ startsAt }) => startsAt.getTime())),
  );
  const history = await tx
    .select({
      gymId: gymClasses.gymId,
      startsAt: classSessions.startsAt,
      workout: programmedWorkouts.workout,
    })
    .from(programmedWorkouts)
    .innerJoin(
      classSessions,
      eq(classSessions.id, programmedWorkouts.classSessionId),
    )
    .innerJoin(gymClasses, eq(gymClasses.id, classSessions.classId))
    .where(
      and(
        eq(gymClasses.gymId, gymId),
        gt(classSessions.startsAt, earliestHistory),
        lt(classSessions.startsAt, latestTarget),
        isNull(classSessions.cancelledAt),
        notInArray(
          classSessions.id,
          targetSessions.map(({ id }) => id),
        ),
      ),
    );

  const recovering = new Set<Muscle>();
  for (const session of targetSessions) {
    for (const muscle of findRecoveringMuscles(
      history,
      gymId,
      session.startsAt,
      windowHours,
    )) {
      recovering.add(muscle);
    }
  }
  return recovering;
}

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
  tx: Transaction,
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

async function persistGymDayInTransaction(
  tx: Transaction,
  gymId: string,
  athleteId: string,
  sessions: readonly TargetSession[],
  workout: Workout,
  sourceWorkoutId: string | null,
): Promise<string[]> {
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
}

/** Transaction-aware core exposed for deterministic concurrency regression tests. */
export async function programGymDayInTransaction(
  tx: Transaction,
  gymId: string,
  athleteId: string,
  localDate: string,
  rawWorkout: unknown,
  sourceWorkoutId: string | null = null,
): Promise<ProgrammedWorkoutWriteResult> {
  const windowHours = await lockProgrammingGymInTransaction(
    tx,
    gymId,
    athleteId,
    "Gym not found",
  );
  const sessions = await lockTargetSessionsInTransaction(
    tx,
    gymId,
    { localDate },
    "No Class Sessions found",
  );
  const recoveringMuscles = await deriveRecoveryMusclesInTransaction(
    tx,
    gymId,
    sessions,
    windowHours,
  );
  const workout = parseProgrammedWorkout(rawWorkout);
  await assertSourceWorkoutExists(tx, sourceWorkoutId);
  const ids = await persistGymDayInTransaction(
    tx,
    gymId,
    athleteId,
    sessions,
    workout,
    sourceWorkoutId,
  );
  return {
    programmedWorkoutIds: ids,
    recoveringMuscles: sortedMuscles(recoveringMuscles),
    warningMuscles: sortedMuscles(
      recoveringMusclesLoadedBy(workout, recoveringMuscles),
    ),
  };
}

export async function programGymDay(
  gymId: string,
  athleteId: string,
  localDate: string,
  rawWorkout: unknown,
  sourceWorkoutId: string | null = null,
): Promise<ProgrammedWorkoutWriteResult> {
  return db.transaction((tx) =>
    programGymDayInTransaction(
      tx,
      gymId,
      athleteId,
      localDate,
      rawWorkout,
      sourceWorkoutId,
    ),
  );
}

export async function generateProgrammedWorkoutForGymDay(
  gymId: string,
  athleteId: string,
  localDate: string,
  options: ProgramOptions,
): Promise<ProgrammedWorkoutWriteResult> {
  return db.transaction(async (tx) => {
    const windowHours = await lockProgrammingGymInTransaction(
      tx,
      gymId,
      athleteId,
      "Gym not found",
    );
    const sessions = await lockTargetSessionsInTransaction(
      tx,
      gymId,
      { localDate },
      "No Class Sessions found",
    );
    const recoveringMuscles = await deriveRecoveryMusclesInTransaction(
      tx,
      gymId,
      sessions,
      windowHours,
    );
    const floorRows = await tx
      .select()
      .from(gymEquipment)
      .where(eq(gymEquipment.gymId, gymId));
    const workout = parseProgrammedWorkout(
      programWorkout(
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
          avoidedMuscles: recoveringMuscles,
        },
        options,
      ),
    );
    const ids = await persistGymDayInTransaction(
      tx,
      gymId,
      athleteId,
      sessions,
      workout,
      null,
    );
    return {
      programmedWorkoutIds: ids,
      recoveringMuscles: sortedMuscles(recoveringMuscles),
      warningMuscles: sortedMuscles(
        recoveringMusclesLoadedBy(workout, recoveringMuscles),
      ),
    };
  });
}

export async function updateProgrammedWorkoutForSession(
  classSessionId: string,
  athleteId: string,
  rawWorkout: unknown,
): Promise<ProgrammedWorkoutWriteResult> {
  return db.transaction(async (tx) => {
    const [candidate] = await tx
      .select({ gymId: gymClasses.gymId })
      .from(classSessions)
      .innerJoin(gymClasses, eq(gymClasses.id, classSessions.classId))
      .where(eq(classSessions.id, classSessionId))
      .limit(1);
    if (!candidate) throw new Error("Class Session not found");
    const windowHours = await lockProgrammingGymInTransaction(
      tx,
      candidate.gymId,
      athleteId,
      "Class Session not found",
    );
    const [session] = await lockTargetSessionsInTransaction(
      tx,
      candidate.gymId,
      { classSessionId },
      "Class Session not found",
    );
    const recoveringMuscles = await deriveRecoveryMusclesInTransaction(
      tx,
      candidate.gymId,
      [session],
      windowHours,
    );
    const workout = parseProgrammedWorkout(rawWorkout);

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
    return {
      programmedWorkoutIds: [updated.id],
      recoveringMuscles: sortedMuscles(recoveringMuscles),
      warningMuscles: sortedMuscles(
        recoveringMusclesLoadedBy(workout, recoveringMuscles),
      ),
    };
  });
}
