"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { athletes } from "@/lib/db/schema";
import { getAthlete, getUser } from "@/lib/data/athlete";
import {
  addImpedimentFor,
  createAthleteProfile,
  removeImpedimentFor,
} from "@/lib/training/profile";

export async function completeOnboarding(raw: unknown) {
  const user = await getUser();
  if (!user) redirect("/sign-in");

  const existing = await getAthlete();
  if (existing) redirect("/");

  await createAthleteProfile(user.id, raw);

  revalidatePath("/", "layout");
  redirect("/");
}

export async function addImpediment(raw: unknown) {
  const athlete = await getAthlete();
  if (!athlete) redirect("/onboarding");

  await addImpedimentFor(athlete.id, raw);
  revalidatePath("/", "layout");
}

export async function removeImpediment(impedimentId: string) {
  const athlete = await getAthlete();
  if (!athlete) redirect("/onboarding");

  await removeImpedimentFor(athlete.id, impedimentId);

  revalidatePath("/", "layout");
}

export async function updateEquipment(equipment: string[]) {
  const athlete = await getAthlete();
  if (!athlete) redirect("/onboarding");

  await db
    .update(athletes)
    .set({ equipment, updatedAt: new Date() })
    .where(eq(athletes.id, athlete.id));

  revalidatePath("/", "layout");
}
