import { and, eq, gte, isNull, lte, or } from "drizzle-orm";
import { db } from "../db";
import {
  assignedWorkouts,
  athletes,
  gymEquipment,
  impediments,
  loadAdjustments,
} from "../db/schema";
import { rowToAthlete } from "../db/mappers";
import type { Equipment } from "../domain/models/equipment";
import type { AssignedMovementProvenance } from "../domain/models/assigned-workout";
import type { Workout } from "../domain/models/workout";
import {
  personaliseWorkout,
  type PersonalisationChange,
} from "../domain/personalisation";
import { newId } from "../ids";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

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
        provenance[field] =
          substituted || (field === "load" && adjustedLoad)
            ? "adjusted"
            : "programmed";
      }
    }
    return provenance;
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
    .select({ id: assignedWorkouts.id })
    .from(assignedWorkouts)
    .where(eq(assignedWorkouts.reservationId, input.reservationId))
    .limit(1);
  if (existing) return existing.id;

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
  const personalised = personaliseWorkout(input.programmedWorkout, context);
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
      if (!adjustment || prescription.load === undefined) return prescription;
      const ratio = Number(adjustment.ratio);
      if (!(ratio > 0 && ratio <= 1)) {
        throw new Error("Load Adjustment ratio must be greater than 0 and at most 1");
      }
      const next = { ...prescription, load: Math.round(prescription.load * ratio) };
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
  const id = newId("assigned_workout");
  const workout = { ...personalised.workout, id, movements };
  const [stored] = await tx
    .insert(assignedWorkouts)
    .values({
      id,
      reservationId: input.reservationId,
      workout,
      provenance: provenanceFor(input.programmedWorkout, workout, changes),
      changes,
    })
    .onConflictDoNothing({ target: assignedWorkouts.reservationId })
    .returning({ id: assignedWorkouts.id });
  if (stored) return stored.id;
  const [conflict] = await tx
    .select({ id: assignedWorkouts.id })
    .from(assignedWorkouts)
    .where(eq(assignedWorkouts.reservationId, input.reservationId))
    .limit(1);
  if (!conflict) throw new Error("Assigned Workout was not materialised");
  return conflict.id;
}
