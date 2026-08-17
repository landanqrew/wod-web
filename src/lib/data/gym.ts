import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { gymEquipment, gyms } from "../db/schema";
import type { Equipment } from "../domain/models/equipment";
import type { Gym } from "../domain/models/gym";

export async function getGymsForAthlete(athleteId: string): Promise<Gym[]> {
  const rows = await db
    .select()
    .from(gyms)
    .where(eq(gyms.ownerAthleteId, athleteId));
  if (rows.length === 0) return [];

  const floorRows = await db
    .select()
    .from(gymEquipment)
    .where(inArray(gymEquipment.gymId, rows.map(({ id }) => id)));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    ownerAthleteId: row.ownerAthleteId,
    floor: floorRows
      .filter(({ gymId }) => gymId === row.id)
      .map(({ equipment, stationCount }) => ({
        equipment: equipment as Equipment,
        ...(stationCount !== null ? { stationCount } : {}),
      })),
  }));
}

export async function getGymForAthlete(
  gymId: string,
  athleteId: string,
): Promise<Gym | null> {
  const [row] = await db
    .select()
    .from(gyms)
    .where(and(eq(gyms.id, gymId), eq(gyms.ownerAthleteId, athleteId)))
    .limit(1);
  if (!row) return null;

  const floor = await db
    .select()
    .from(gymEquipment)
    .where(eq(gymEquipment.gymId, gymId));
  return {
    id: row.id,
    name: row.name,
    ownerAthleteId: row.ownerAthleteId,
    floor: floor.map(({ equipment, stationCount }) => ({
      equipment: equipment as Equipment,
      ...(stationCount !== null ? { stationCount } : {}),
    })),
  };
}
