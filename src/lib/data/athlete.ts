import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { athletes, impediments } from "@/lib/db/schema";
import { rowToAthlete } from "@/lib/db/mappers";
import { auth } from "@/lib/auth";
import type { Athlete } from "@/lib/domain/models/athlete";

/** The signed-in user, or null. Deduped per request. */
export const getUser = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
});

/** Hydrate an athlete plus their impediments, which the engines need together. */
export async function getAthleteById(athleteId: string): Promise<Athlete | null> {
  const [row] = await db.select().from(athletes).where(eq(athletes.id, athleteId)).limit(1);
  if (!row) return null;

  const impedimentRows = await db
    .select()
    .from(impediments)
    .where(eq(impediments.athleteId, row.id));

  return rowToAthlete(row, impedimentRows);
}

/** The signed-in user's athlete profile, or null if onboarding is incomplete. */
export const getAthlete = cache(async (): Promise<Athlete | null> => {
  const user = await getUser();
  if (!user) return null;

  const [row] = await db.select().from(athletes).where(eq(athletes.userId, user.id)).limit(1);
  if (!row) return null;

  return getAthleteById(row.id);
});

/** Guard for every athlete-scoped page and action. */
export async function requireAthlete(): Promise<Athlete> {
  const user = await getUser();
  if (!user) redirect("/sign-in");
  const athlete = await getAthlete();
  if (!athlete) redirect("/onboarding");
  return athlete;
}
