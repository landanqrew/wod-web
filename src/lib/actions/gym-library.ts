"use server";

import { revalidatePath } from "next/cache";
import { requireAthlete } from "../data/athlete";
import { getGymLibrary } from "../data/gym-library";
import {
  saveGymLibraryWorkout,
  updateGymLibraryWorkout,
} from "../training/gym-library";

export async function getGymLibraryAction(gymId: string) {
  const athlete = await requireAthlete();
  return getGymLibrary(gymId, athlete.id);
}

export async function saveGymLibraryWorkoutAction(gymId: string, workout: unknown) {
  const athlete = await requireAthlete();
  const id = await saveGymLibraryWorkout(gymId, athlete.id, workout);
  revalidatePath("/classes");
  return { id };
}

export async function updateGymLibraryWorkoutAction(
  gymId: string,
  workoutId: string,
  workout: unknown,
) {
  const athlete = await requireAthlete();
  await updateGymLibraryWorkout(gymId, athlete.id, workoutId, workout);
  revalidatePath("/classes");
}
