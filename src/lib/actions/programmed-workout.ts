"use server";

import { revalidatePath } from "next/cache";
import { requireAthlete } from "../data/athlete";
import type { ProgramOptions } from "../domain/programming";
import { generateOptionsSchema } from "../validation";
import {
  generateProgrammedWorkoutForGymDay,
  programGymDay,
  programGymDayFromSource,
  updateProgrammedWorkoutForSession,
} from "../training/programmed-workout";

export async function programGymDayAction(
  gymId: string,
  localDate: string,
  workout: unknown,
) {
  const athlete = await requireAthlete();
  const result = await programGymDay(gymId, athlete.id, localDate, workout);
  revalidatePath("/classes");
  return result;
}

export async function programGymDayFromSourceAction(
  gymId: string,
  localDate: string,
  sourceWorkoutId: string,
  workout?: unknown,
) {
  const athlete = await requireAthlete();
  const result = await programGymDayFromSource(
    gymId,
    athlete.id,
    localDate,
    sourceWorkoutId,
    workout,
  );
  revalidatePath("/classes");
  return result;
}

export async function generateGymDayAction(
  gymId: string,
  localDate: string,
  options: unknown,
) {
  const athlete = await requireAthlete();
  const parsedOptions = generateOptionsSchema.parse(options);
  const result = await generateProgrammedWorkoutForGymDay(
    gymId,
    athlete.id,
    localDate,
    parsedOptions as ProgramOptions,
  );
  revalidatePath("/classes");
  return result;
}

export async function updateSessionProgrammedWorkoutAction(
  classSessionId: string,
  workout: unknown,
) {
  const athlete = await requireAthlete();
  const result = await updateProgrammedWorkoutForSession(
    classSessionId,
    athlete.id,
    workout,
  );
  revalidatePath("/classes");
  return result;
}
