import { and, eq, gte, isNull, lte, or } from "drizzle-orm";
import type { z } from "zod";
import { db } from "../db";
import {
  assignedWorkouts,
  athletes,
  classSessions,
  gymClasses,
  gymEquipment,
  impediments,
  programmedWorkouts,
  reservations,
  workoutResults,
} from "../db/schema";
import { rowToAthlete } from "../db/mappers";
import type { AssignedMovementProvenance } from "../domain/models/assigned-workout";
import type { Equipment } from "../domain/models/equipment";
import type { MovementPrescription } from "../domain/models/workout";
import { getMovement } from "../domain/movements/library";
import {
  ATHLETE_OVERRIDE_EXPLANATION_PREFIX,
  ATHLETE_OVERRIDE_WARNING_PREFIX,
  type PersonalisationChange,
} from "../domain/personalisation";
import { createMovementPrescription } from "../domain/prescription";
import { checkMovement, mergeConstraints } from "../domain/scaling/constraint-engine";
import { assignedWorkoutOverrideSchema } from "../validation";
import { resolveProgrammedMovements, syncAssignedWorkoutLedger } from "./assigned-workout";
import { loadAdjustmentOffer } from "./load-adjustment";

type OverrideInput = z.infer<typeof assignedWorkoutOverrideSchema>;

const PRESCRIPTION_FIELDS = ["movementId", "reps", "load", "distance", "duration", "calories", "notes"] as const;

function allowedOverrideFields(loadType: string): Set<string> {
  switch (loadType) {
    case "weighted":
      return new Set(["reps", "load"]);
    case "bodyweight":
      return new Set(["reps"]);
    case "duration":
      return new Set(["duration"]);
    default:
      return new Set();
  }
}

function overrideSummary(
  movementIndex: number,
  prescription: MovementPrescription,
  provenance: AssignedMovementProvenance
): string {
  const values = PRESCRIPTION_FIELDS.filter((field) => provenance[field] === "overridden").map(
    (field) => `${field} ${String(prescription[field])}`
  );
  return `${ATHLETE_OVERRIDE_EXPLANATION_PREFIX} movement ${movementIndex + 1} ${values.join(", ")}`;
}

function replaceOverrideExplanation(
  changes: PersonalisationChange[],
  movementIndex: number,
  programmedMovementId: string,
  personalisedMovementId: string,
  explanations: string[]
): PersonalisationChange[] {
  const next = changes
    .map((change) => ({
      ...change,
      explanations:
        change.movementIndex === movementIndex
          ? change.explanations.filter(
              (item) =>
                !item.startsWith(ATHLETE_OVERRIDE_EXPLANATION_PREFIX) &&
                !item.startsWith(ATHLETE_OVERRIDE_WARNING_PREFIX)
            )
          : [...change.explanations],
    }))
    .filter((change) => change.explanations.length > 0);
  const existing = next.find((change) => change.movementIndex === movementIndex);
  if (existing) existing.explanations.push(...explanations);
  else {
    next.push({
      movementIndex,
      originalMovementId: programmedMovementId,
      personalisedMovementId,
      explanations,
    });
  }
  return next;
}

/** Apply an athlete-authored edit immediately to their own Assigned Workout. */
export async function overrideAssignedWorkoutForAthlete(classSessionId: string, athleteId: string, raw: unknown) {
  const input: OverrideInput = assignedWorkoutOverrideSchema.parse(raw);
  return db.transaction(async (tx) => {
    const [session] = await tx
      .select({
        id: classSessions.id,
        localDate: classSessions.localDate,
        gymId: gymClasses.gymId,
      })
      .from(classSessions)
      .innerJoin(gymClasses, eq(gymClasses.id, classSessions.classId))
      .where(eq(classSessions.id, classSessionId))
      .limit(1)
      .for("update", { of: classSessions });
    if (!session) throw new Error("Class Session not found");

    const [reservation] = await tx
      .select({ id: reservations.id })
      .from(reservations)
      .where(and(eq(reservations.classSessionId, classSessionId), eq(reservations.athleteId, athleteId)))
      .limit(1)
      .for("update");
    if (!reservation) throw new Error("Assigned Workout not found");

    const [assigned] = await tx
      .select()
      .from(assignedWorkouts)
      .where(eq(assignedWorkouts.reservationId, reservation.id))
      .limit(1)
      .for("update");
    const [programmed] = await tx
      .select({ workout: programmedWorkouts.workout })
      .from(programmedWorkouts)
      .where(eq(programmedWorkouts.classSessionId, classSessionId))
      .limit(1);
    if (!assigned || !programmed) throw new Error("Assigned Workout not found");
    const [completed] = await tx
      .select({ id: workoutResults.id })
      .from(workoutResults)
      .where(eq(workoutResults.assignedWorkoutId, assigned.id))
      .limit(1);
    if (completed) throw new Error("A completed Assigned Workout cannot be edited");

    const current = assigned.workout.movements[input.movementIndex];
    const currentProvenance = assigned.provenance[input.movementIndex];
    if (!current || !currentProvenance) throw new Error("Movement line not found");

    const [athleteRow] = await tx.select().from(athletes).where(eq(athletes.id, athleteId)).limit(1);
    const impedimentRows = await tx
      .select()
      .from(impediments)
      .where(
        and(
          eq(impediments.athleteId, athleteId),
          lte(impediments.startDate, session.localDate),
          or(isNull(impediments.endDate), gte(impediments.endDate, session.localDate))
        )
      );
    const floorRows = await tx
      .select({ equipment: gymEquipment.equipment })
      .from(gymEquipment)
      .where(eq(gymEquipment.gymId, session.gymId));
    if (!athleteRow) throw new Error("Athlete not found");
    const athlete = rowToAthlete(athleteRow, impedimentRows);
    const floor = new Set(floorRows.map(({ equipment }) => equipment as Equipment));
    const targetMovementId = input.movementId ?? current.movementId;
    const target = getMovement(targetMovementId);
    if (!target) throw new Error("Movement not found");
    const check = checkMovement(target, mergeConstraints(athlete.impediments), floor);
    if (!check.allowed) {
      throw new Error(`Movement is not available: ${check.reasons.join("; ")}`);
    }

    const movementChanged = targetMovementId !== current.movementId;
    const prescription = movementChanged
      ? {
          ...createMovementPrescription(target, assigned.workout.format, athlete.sex),
          ...(current.notes === undefined ? {} : { notes: current.notes }),
        }
      : { ...current };
    const provenance: AssignedMovementProvenance = movementChanged
      ? {
          programmedMovementId:
            currentProvenance.programmedMovementId ??
            programmed.workout.movements[input.movementIndex]?.movementId ??
            current.movementId,
          movementId: "overridden",
        }
      : { ...currentProvenance };

    if (movementChanged) {
      for (const field of PRESCRIPTION_FIELDS.slice(1)) {
        if (prescription[field] !== undefined) provenance[field] = "overridden";
      }
    }
    const allowedFields = allowedOverrideFields(target.loadType);
    for (const field of ["reps", "load", "duration"] as const) {
      const value = input[field];
      if (value === undefined) continue;
      if (!allowedFields.has(field)) {
        throw new Error(`${field} cannot be set for ${target.loadType} Movements`);
      }
      Object.assign(prescription, { [field]: value });
      provenance[field] = "overridden";
      if (field === "load" && current.load !== undefined) {
        provenance.loadOverridePreviousValue = current.load;
      }
    }

    const programmedMovements = resolveProgrammedMovements(programmed.workout, athlete.sex);
    const explanations = [overrideSummary(input.movementIndex, prescription, provenance)];
    const programmedPrescription = programmedMovements[input.movementIndex];
    if (
      prescription.load !== undefined &&
      programmedPrescription?.movementId === prescription.movementId &&
      programmedPrescription.load !== undefined &&
      prescription.load > programmedPrescription.load
    ) {
      explanations.push(
        `${ATHLETE_OVERRIDE_WARNING_PREFIX} movement ${input.movementIndex + 1} load is heavier than programmed`
      );
    }
    const movements = assigned.workout.movements.map((movement, index) =>
      index === input.movementIndex ? prescription : movement
    );
    const nextProvenance = assigned.provenance.map((entry, index) =>
      index === input.movementIndex ? provenance : entry
    );
    const changes = replaceOverrideExplanation(
      assigned.changes,
      input.movementIndex,
      provenance.programmedMovementId ?? targetMovementId,
      targetMovementId,
      explanations
    );
    const snapshot = {
      workout: { ...assigned.workout, movements },
      provenance: nextProvenance,
      changes,
    };
    await tx
      .update(assignedWorkouts)
      .set({
        ...snapshot,
        updatedAt: new Date(),
      })
      .where(eq(assignedWorkouts.id, assigned.id));
    await syncAssignedWorkoutLedger(tx, athleteId, snapshot);
    return input.load === undefined || current.load === undefined || input.load >= current.load
      ? null
      : loadAdjustmentOffer(targetMovementId, input.load, athlete.sex);
  });
}
