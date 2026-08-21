"use server";

import { requireAthlete } from "../data/athlete";
import { getClassSessionRoster } from "../data/roster";

export async function getClassSessionRosterAction(classSessionId: string) {
  const athlete = await requireAthlete();
  return getClassSessionRoster(classSessionId, athlete.id);
}
