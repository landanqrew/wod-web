import { and, eq, gte, isNull, lte, or } from "drizzle-orm";
import { isDeepStrictEqual } from "node:util";
import { db } from "../db";
import {
  assignedWorkouts,
  athletes,
  classSessions,
  gymClasses,
  gymEquipment,
  impediments,
  loadAdjustments,
  programmedWorkouts,
  reservations,
  workouts,
} from "../db/schema";
import { rowToAthlete, workoutToRow } from "../db/mappers";
import type { Equipment } from "../domain/models/equipment";
import { Sex } from "../domain/models/athlete";
import type { AssignedMovementProvenance } from "../domain/models/assigned-workout";
import type { MovementPrescription, Workout } from "../domain/models/workout";
import { getAllMovements } from "../domain/movements/library";
import {
  applyLoadAdjustment,
  personaliseWorkout,
  reconcileAssignedWorkout,
  type ReconciliationSnapshot,
  type PersonalisationChange,
} from "../domain/personalisation";
import { checkMovement, mergeConstraints } from "../domain/scaling/constraint-engine";
import { newId } from "../ids";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function resolveProgrammedMovements(
  workout: Workout,
  sex: Sex,
): MovementPrescription[] {
  return workout.movements.map((prescription) => {
    const { rxLoad, ...resolved } = prescription;
    return rxLoad === undefined
      ? resolved
      : {
          ...resolved,
          load: sex === Sex.Male ? rxLoad.male : rxLoad.female,
        };
  });
}

function provenanceFor(
  programmed: Workout,
  assigned: Workout,
  changes: PersonalisationChange[],
): AssignedMovementProvenance[] {
  return assigned.movements.map((prescription, movementIndex) => {
    const original = programmed.movements[movementIndex];
    const changed = changes.find((change) => change.movementIndex === movementIndex);
    const substituted = original?.movementId !== prescription.movementId;
    const adjustedLoad = changed?.explanations.some(
      (explanation) => !explanation.startsWith("Resolved Rx Pair"),
    );
    const provenance: AssignedMovementProvenance = {
      programmedMovementId: original?.movementId ?? prescription.movementId,
      movementId: substituted ? "adjusted" : "programmed",
    };
    for (const field of [
      "reps",
      "load",
      "distance",
      "duration",
      "calories",
      "notes",
    ] as const) {
      if (prescription[field] !== undefined) {
        if (field === "load") {
          provenance[field] =
            substituted || adjustedLoad ? "adjusted" : "programmed";
        } else {
          provenance[field] =
            original?.[field] === prescription[field]
              ? "programmed"
              : "adjusted";
        }
      }
    }
    return provenance;
  });
}

export async function deriveAssignedWorkout(
  tx: Transaction,
  input: {
    reservationId: string;
    athleteId: string;
    gymId: string;
    localDate: string;
    programmedWorkout: Workout;
  },
  assignedWorkoutId: string,
): Promise<{
  snapshot: ReconciliationSnapshot;
  programmedMovements: MovementPrescription[];
  allowedMovementIds: ReadonlySet<string>;
}> {
  const athleteRow = await tx
    .select()
    .from(athletes)
    .where(eq(athletes.id, input.athleteId))
    .limit(1);
  const impedimentRows = await tx
    .select()
    .from(impediments)
    .where(
      and(
        eq(impediments.athleteId, input.athleteId),
        lte(impediments.startDate, input.localDate),
        or(
          isNull(impediments.endDate),
          gte(impediments.endDate, input.localDate),
        ),
      ),
    );
  const floorRows = await tx
    .select({ equipment: gymEquipment.equipment })
    .from(gymEquipment)
    .where(eq(gymEquipment.gymId, input.gymId));
  const adjustmentRows = await tx
    .select()
    .from(loadAdjustments)
    .where(
      and(
        eq(loadAdjustments.athleteId, input.athleteId),
        isNull(loadAdjustments.revokedAt),
      ),
    );
  const athlete = athleteRow[0];
  if (!athlete) throw new Error("Athlete not found");
  const context = rowToAthlete(athlete, impedimentRows);
  context.equipment = new Set(
    floorRows.map(({ equipment }) => equipment as Equipment),
  );
  const constraints = mergeConstraints(context.impediments);
  const allowedMovementIds = new Set(
    getAllMovements()
      .filter((movement) =>
        checkMovement(movement, constraints, context.equipment).allowed,
      )
      .map(({ id }) => id),
  );
  const personalised = personaliseWorkout(input.programmedWorkout, context);
  const programmedMovements = resolveProgrammedMovements(
    input.programmedWorkout,
    context.sex,
  );
  const changes = personalised.changes.map((change) => ({
    ...change,
    explanations: [...change.explanations],
  }));
  const movements = personalised.workout.movements.map(
    (prescription, movementIndex) => {
      const originalMovementId = input.programmedWorkout.movements[movementIndex]?.movementId;
      const adjustment = adjustmentRows.find(
        ({ movementId }) => movementId === originalMovementId,
      );
      if (
        !adjustment ||
        prescription.load === undefined ||
        prescription.movementId !== originalMovementId
      ) {
        return prescription;
      }
      const ratio = Number(adjustment.ratio);
      const adjustedProgrammed = applyLoadAdjustment(
        programmedMovements[movementIndex] ?? prescription,
        { movementId: originalMovementId, ratio },
      );
      const next = {
        ...prescription,
        load: Math.min(prescription.load, adjustedProgrammed.load!),
      };
      const existingChange = changes.find(
        (change) => change.movementIndex === movementIndex,
      );
      const explanation = `Applied ${Math.round(ratio * 100)}% Load Adjustment`;
      if (existingChange) existingChange.explanations.push(explanation);
      else {
        changes.push({
          movementIndex,
          originalMovementId: originalMovementId ?? prescription.movementId,
          personalisedMovementId: prescription.movementId,
          explanations: [explanation],
        });
      }
      return next;
    },
  );
  const workout = { ...personalised.workout, id: assignedWorkoutId, movements };
  return {
    snapshot: {
      workout,
      provenance: provenanceFor(input.programmedWorkout, workout, changes),
      changes,
    },
    programmedMovements,
    allowedMovementIds,
  };
}

function snapshotsEqual(
  left: ReconciliationSnapshot,
  right: ReconciliationSnapshot,
): boolean {
  return isDeepStrictEqual(left, right);
}

export async function syncAssignedWorkoutLedger(
  tx: Transaction,
  athleteId: string,
  snapshot: ReconciliationSnapshot,
) {
  const { id: _id, createdAt: _createdAt, ...values } = workoutToRow(
    snapshot.workout,
    athleteId,
  );
  await tx
    .insert(workouts)
    .values(workoutToRow(snapshot.workout, athleteId))
    .onConflictDoUpdate({
      target: workouts.id,
      set: { ...values, updatedAt: new Date() },
    });
}

export async function materialiseAssignedWorkout(
  tx: Transaction,
  input: {
    reservationId: string;
    athleteId: string;
    gymId: string;
    localDate: string;
    programmedWorkout: Workout;
  },
) {
  const [existing] = await tx
    .select()
    .from(assignedWorkouts)
    .where(eq(assignedWorkouts.reservationId, input.reservationId))
    .limit(1)
    .for("update");
  const id = existing?.id ?? newId("assigned_workout");
  const { snapshot: derived, programmedMovements, allowedMovementIds } =
    await deriveAssignedWorkout(tx, input, id);
  if (existing) {
    const current: ReconciliationSnapshot = {
      workout: existing.workout,
      provenance: existing.provenance,
      changes: existing.changes,
    };
    const reconciled = reconcileAssignedWorkout(
      current,
      derived,
      programmedMovements,
      new Set(
        current.workout.movements.flatMap((prescription, movementIndex) =>
          current.provenance[movementIndex]?.movementId === "overridden" &&
          !allowedMovementIds.has(prescription.movementId)
            ? [movementIndex]
            : [],
        ),
      ),
    ).snapshot;
    if (!snapshotsEqual(current, reconciled)) {
      await tx
        .update(assignedWorkouts)
        .set({ ...reconciled, updatedAt: new Date() })
        .where(eq(assignedWorkouts.id, existing.id));
    }
    await syncAssignedWorkoutLedger(tx, input.athleteId, reconciled);
    return existing.id;
  }

  const [stored] = await tx
    .insert(assignedWorkouts)
    .values({
      id,
      reservationId: input.reservationId,
      ...derived,
    })
    .onConflictDoNothing({ target: assignedWorkouts.reservationId })
    .returning({ id: assignedWorkouts.id });
  if (stored) {
    await syncAssignedWorkoutLedger(tx, input.athleteId, derived);
    return stored.id;
  }
  const [conflict] = await tx
    .select()
    .from(assignedWorkouts)
    .where(eq(assignedWorkouts.reservationId, input.reservationId))
    .limit(1);
  if (!conflict) throw new Error("Assigned Workout was not materialised");
  await syncAssignedWorkoutLedger(tx, input.athleteId, {
    workout: conflict.workout,
    provenance: conflict.provenance,
    changes: conflict.changes,
  });
  return conflict.id;
}

export async function reconcileAssignedWorkoutsForAthleteInTransaction(
  tx: Transaction,
  athleteId: string,
) {
  const rows = await tx
    .select({
      reservationId: reservations.id,
      gymId: gymClasses.gymId,
      localDate: classSessions.localDate,
      programmedWorkout: programmedWorkouts.workout,
    })
    .from(assignedWorkouts)
    .innerJoin(
      reservations,
      eq(reservations.id, assignedWorkouts.reservationId),
    )
    .innerJoin(classSessions, eq(classSessions.id, reservations.classSessionId))
    .innerJoin(gymClasses, eq(gymClasses.id, classSessions.classId))
    .innerJoin(
      programmedWorkouts,
      eq(programmedWorkouts.classSessionId, classSessions.id),
    )
    .where(
      and(
        eq(reservations.athleteId, athleteId),
        isNull(classSessions.cancelledAt),
        gte(classSessions.startsAt, new Date()),
      ),
    )
    .for("update", { of: assignedWorkouts });
  for (const row of rows) {
    await materialiseAssignedWorkout(tx, { ...row, athleteId });
  }
}

export async function reconcileAssignedWorkoutsForAthlete(athleteId: string) {
  await db.transaction((tx) =>
    reconcileAssignedWorkoutsForAthleteInTransaction(tx, athleteId),
  );
}

/** Lazy upgrade reconciliation for Reservations that pre-date Assigned Workouts. */
export async function ensureAssignedWorkoutsForAthlete(athleteId: string) {
  await db.transaction(async (tx) => {
    const missing = await tx
      .select({
        reservationId: reservations.id,
        gymId: gymClasses.gymId,
        localDate: classSessions.localDate,
        programmedWorkout: programmedWorkouts.workout,
      })
      .from(reservations)
      .innerJoin(classSessions, eq(classSessions.id, reservations.classSessionId))
      .innerJoin(gymClasses, eq(gymClasses.id, classSessions.classId))
      .innerJoin(
        programmedWorkouts,
        eq(programmedWorkouts.classSessionId, classSessions.id),
      )
      .leftJoin(
        assignedWorkouts,
        eq(assignedWorkouts.reservationId, reservations.id),
      )
      .where(
        and(
          eq(reservations.athleteId, athleteId),
          isNull(assignedWorkouts.id),
        ),
      )
      .for("update", { of: reservations });
    for (const row of missing) {
      await materialiseAssignedWorkout(tx, {
        ...row,
        athleteId,
      });
    }
  });
}
