"use server";

import { revalidatePath } from "next/cache";
import { requireAthlete } from "../data/athlete";
import {
  promoteLoadAdjustmentForAthlete,
  revokeLoadAdjustmentForAthlete,
} from "../training/load-adjustment";

export async function promoteLoadAdjustmentAction(input: unknown) {
  const athlete = await requireAthlete();
  const result = await promoteLoadAdjustmentForAthlete(athlete.id, input);
  revalidatePath("/classes");
  revalidatePath("/adjustments");
  return result;
}

export async function revokeLoadAdjustmentAction(adjustmentId: string) {
  const athlete = await requireAthlete();
  await revokeLoadAdjustmentForAthlete(athlete.id, adjustmentId);
  revalidatePath("/classes");
  revalidatePath("/adjustments");
}
