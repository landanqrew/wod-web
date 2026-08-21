"use server";

import { revalidatePath } from "next/cache";
import { requireAthlete } from "../data/athlete";
import { overrideAssignedWorkoutForAthlete } from "../training/assigned-workout-override";

export async function overrideAssignedWorkoutAction(
  classSessionId: string,
  override: unknown,
) {
  const athlete = await requireAthlete();
  const loadAdjustmentOffer = await overrideAssignedWorkoutForAthlete(
    classSessionId,
    athlete.id,
    override,
  );
  revalidatePath("/classes");
  return { loadAdjustmentOffer };
}
