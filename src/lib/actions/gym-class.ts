"use server";

import { revalidatePath } from "next/cache";
import { requireAthlete } from "../data/athlete";
import {
  cancelClassSessionForOwner,
  createClassForOwner,
  updateClassForOwner,
} from "../training/gym-class";

export async function createClassAction(gymId: string, raw: unknown) {
  const athlete = await requireAthlete();
  const classId = await createClassForOwner(gymId, athlete.id, raw);
  revalidatePath("/classes");
  return classId;
}

export async function updateClassAction(classId: string, raw: unknown) {
  const athlete = await requireAthlete();
  await updateClassForOwner(classId, athlete.id, raw);
  revalidatePath("/classes");
}

export async function cancelClassSessionAction(classSessionId: string) {
  const athlete = await requireAthlete();
  await cancelClassSessionForOwner(classSessionId, athlete.id);
  revalidatePath("/classes");
}
