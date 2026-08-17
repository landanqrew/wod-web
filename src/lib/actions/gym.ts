"use server";

import { revalidatePath } from "next/cache";
import { requireAthlete } from "../data/athlete";
import {
  createGymForOwner,
  grantGymMembership,
  revokeGymMembership,
  updateGymForOwner,
} from "../training/gym";

export async function createGymAction(raw: unknown) {
  const athlete = await requireAthlete();
  const gymId = await createGymForOwner(athlete.id, raw);
  revalidatePath("/gyms");
  return gymId;
}

export async function updateGymAction(gymId: string, raw: unknown) {
  const athlete = await requireAthlete();
  await updateGymForOwner(gymId, athlete.id, raw);
  revalidatePath("/gyms");
}

export async function grantGymMembershipAction(gymId: string, raw: unknown) {
  const athlete = await requireAthlete();
  await grantGymMembership(gymId, athlete.id, raw);
  revalidatePath("/gyms");
}

export async function revokeGymMembershipAction(
  gymId: string,
  targetAthleteId: string,
) {
  const athlete = await requireAthlete();
  await revokeGymMembership(gymId, athlete.id, targetAthleteId);
  revalidatePath("/gyms");
}
