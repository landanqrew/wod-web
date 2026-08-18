import { and, desc, eq, isNull } from "drizzle-orm";
import type { z } from "zod";
import { db } from "../db";
import {
  assignedWorkouts,
  athletes,
  loadAdjustments,
  reservations,
  workoutResults,
} from "../db/schema";
import { Sex } from "../domain/models/athlete";
import {
  DEFAULT_LOAD_ADJUSTMENT_REVIEW_SESSIONS,
  deriveLoadAdjustmentRatio,
  loadAdjustmentReview,
} from "../domain/personalisation/load-adjustment";
import { getMovement } from "../domain/movements/library";
import type { WorkoutResult } from "../domain/models/workout-result";
import { rowToResult } from "../db/mappers";
import { newId } from "../ids";
import { promoteLoadAdjustmentSchema } from "../validation";
import { reconcileAssignedWorkoutsForAthleteInTransaction } from "./assigned-workout";

type PromotionInput = z.infer<typeof promoteLoadAdjustmentSchema>;
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function lockLoadAdjustmentAthleteInTransaction(
  tx: Transaction,
  athleteId: string,
) {
  const [athlete] = await tx
    .select({ sex: athletes.sex })
    .from(athletes)
    .where(eq(athletes.id, athleteId))
    .limit(1)
    .for("update");
  if (!athlete) throw new Error("Athlete not found");
  return athlete;
}

export interface LoadAdjustmentOffer {
  movementId: string;
  movementName: string;
  ratio: number;
  percent: number;
}

export type PromoteLoadAdjustmentResult =
  | { status: "created"; adjustmentId: string }
  | { status: "impediment_required" };

export interface ActiveLoadAdjustment {
  id: string;
  movementId: string;
  movementName: string;
  ratio: number;
  percent: number;
  referenceLoad: number;
  reviewAfterSessions: number;
  cleanSessionRun: number;
  reviewDue: boolean;
  createdAt: string;
}

export function loadAdjustmentOffer(
  movementId: string,
  overrideLoad: number,
  sex: Sex,
): LoadAdjustmentOffer | null {
  const movement = getMovement(movementId);
  const libraryRxLoad =
    sex === Sex.Male
      ? movement?.defaultLoadMale
      : movement?.defaultLoadFemale;
  if (
    !movement ||
    libraryRxLoad === undefined ||
    !(overrideLoad > 0) ||
    overrideLoad >= libraryRxLoad
  ) {
    return null;
  }
  const ratio = deriveLoadAdjustmentRatio(overrideLoad, libraryRxLoad);
  if (Math.round(libraryRxLoad * ratio) === 0) return null;
  return {
    movementId,
    movementName: movement.name,
    ratio,
    percent: Math.round(ratio * 100),
  };
}

export async function promoteLoadAdjustmentForAthlete(
  athleteId: string,
  raw: unknown,
): Promise<PromoteLoadAdjustmentResult> {
  const input: PromotionInput = promoteLoadAdjustmentSchema.parse(raw);
  if (input.reason === "injury") return { status: "impediment_required" };

  return db.transaction(async (tx) => {
    const athlete = await lockLoadAdjustmentAthleteInTransaction(tx, athleteId);
    const [row] = await tx
      .select({ assigned: assignedWorkouts })
      .from(assignedWorkouts)
      .innerJoin(
        reservations,
        eq(reservations.id, assignedWorkouts.reservationId),
      )
      .where(
        and(
          eq(reservations.classSessionId, input.classSessionId),
          eq(reservations.athleteId, athleteId),
        ),
      )
      .limit(1)
      .for("update", { of: assignedWorkouts });
    const prescription = row?.assigned.workout.movements[input.movementIndex];
    const provenance = row?.assigned.provenance[input.movementIndex];
    if (
      !row ||
      !prescription ||
      provenance?.load !== "overridden" ||
      provenance.loadOverridePreviousValue === undefined ||
      prescription.load === undefined ||
      prescription.load >= provenance.loadOverridePreviousValue
    ) {
      throw new Error("A Load Adjustment must be promoted from a load Override");
    }
    const offer = loadAdjustmentOffer(
      prescription.movementId,
      prescription.load ?? 0,
      athlete.sex as Sex,
    );
    if (!offer) {
      throw new Error("This load Override cannot become a Load Adjustment");
    }

    await tx
      .update(loadAdjustments)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(loadAdjustments.athleteId, athleteId),
          eq(loadAdjustments.movementId, offer.movementId),
          isNull(loadAdjustments.revokedAt),
        ),
      );
    const id = newId("load_adjustment");
    await tx.insert(loadAdjustments).values({
      id,
      athleteId,
      movementId: offer.movementId,
      ratio: offer.ratio.toFixed(4),
      reviewAfterSessions:
        input.reviewAfterSessions ?? DEFAULT_LOAD_ADJUSTMENT_REVIEW_SESSIONS,
    });
    await reconcileAssignedWorkoutsForAthleteInTransaction(tx, athleteId);
    return { status: "created", adjustmentId: id };
  });
}

export async function revokeLoadAdjustmentForAthlete(
  athleteId: string,
  adjustmentId: string,
): Promise<void> {
  await db.transaction((tx) =>
    revokeLoadAdjustmentForAthleteInTransaction(tx, athleteId, adjustmentId),
  );
}

export async function revokeLoadAdjustmentForAthleteInTransaction(
  tx: Transaction,
  athleteId: string,
  adjustmentId: string,
): Promise<void> {
  await lockLoadAdjustmentAthleteInTransaction(tx, athleteId);
  const [revoked] = await tx
    .update(loadAdjustments)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(loadAdjustments.id, adjustmentId),
        eq(loadAdjustments.athleteId, athleteId),
        isNull(loadAdjustments.revokedAt),
      ),
    )
    .returning({ id: loadAdjustments.id });
  if (!revoked) throw new Error("Load Adjustment not found");
  await reconcileAssignedWorkoutsForAthleteInTransaction(tx, athleteId);
}

export async function getActiveLoadAdjustmentsForAthlete(
  athleteId: string,
): Promise<ActiveLoadAdjustment[]> {
  const [athlete] = await db
    .select({ sex: athletes.sex })
    .from(athletes)
    .where(eq(athletes.id, athleteId))
    .limit(1);
  if (!athlete) throw new Error("Athlete not found");
  const [adjustments, resultRows] = await Promise.all([
    db
      .select()
      .from(loadAdjustments)
      .where(
        and(
          eq(loadAdjustments.athleteId, athleteId),
          isNull(loadAdjustments.revokedAt),
        ),
      )
      .orderBy(desc(loadAdjustments.createdAt)),
    db
      .select()
      .from(workoutResults)
      .where(eq(workoutResults.athleteId, athleteId))
      .orderBy(desc(workoutResults.performedAt)),
  ]);
  const results: WorkoutResult[] = resultRows.map(rowToResult);
  return adjustments.flatMap((adjustment) => {
    const movement = getMovement(adjustment.movementId);
    const libraryRx =
      athlete.sex === Sex.Male
        ? movement?.defaultLoadMale
        : movement?.defaultLoadFemale;
    if (!movement || libraryRx === undefined) return [];
    const ratio = Number(adjustment.ratio);
    const referenceLoad = Math.round(libraryRx * ratio);
    const review = loadAdjustmentReview(results, {
      movementId: adjustment.movementId,
      referenceLoad,
      createdAt: adjustment.createdAt.toISOString(),
      requiredCleanSessions: adjustment.reviewAfterSessions,
    });
    return [
      {
        id: adjustment.id,
        movementId: adjustment.movementId,
        movementName: movement.name,
        ratio,
        percent: Math.round(ratio * 100),
        referenceLoad,
        reviewAfterSessions: adjustment.reviewAfterSessions,
        ...review,
        createdAt: adjustment.createdAt.toISOString(),
      },
    ];
  });
}
