"use server";

import { revalidatePath } from "next/cache";
import { requireAthlete } from "../data/athlete";
import {
  cancelReservationForAthlete,
  reserveClassSessionForAthlete,
} from "../training/reservation";

export async function reserveClassSessionAction(classSessionId: string) {
  const athlete = await requireAthlete();
  await reserveClassSessionForAthlete(classSessionId, athlete.id);
  revalidatePath("/classes");
}

export async function cancelReservationAction(
  classSessionId: string,
  discardAssignedWorkout = false,
) {
  const athlete = await requireAthlete();
  const result = await cancelReservationForAthlete(
    classSessionId,
    athlete.id,
    discardAssignedWorkout,
  );
  revalidatePath("/classes");
  return result;
}
