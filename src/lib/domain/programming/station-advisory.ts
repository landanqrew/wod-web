import { Equipment } from "../models/equipment";
import type { Workout } from "../models/workout";
import { getMovement } from "../movements/library";

export interface StationWarning {
  movementId: string;
  movementName: string;
  equipment: Equipment;
  reservedHeadcount: number;
  availableStations: number;
  shortfall: number;
}

/** Check explicit Station counts without inferring limits for undeclared counts. */
export function findStationWarnings(
  workout: Workout,
  stationCounts: Readonly<Partial<Record<Equipment, number>>>,
  reservedHeadcount: number,
): StationWarning[] {
  if (reservedHeadcount <= 0) return [];
  const warnings: StationWarning[] = [];
  const seen = new Set<string>();

  for (const prescription of workout.movements) {
    const movement = getMovement(prescription.movementId);
    if (!movement) continue;
    for (const equipment of movement.equipment) {
      const availableStations = stationCounts[equipment];
      const key = `${movement.id}:${equipment}`;
      if (
        equipment === Equipment.None ||
        availableStations === undefined ||
        availableStations >= reservedHeadcount ||
        seen.has(key)
      ) {
        continue;
      }
      seen.add(key);
      warnings.push({
        movementId: movement.id,
        movementName: movement.name,
        equipment,
        reservedHeadcount,
        availableStations,
        shortfall: reservedHeadcount - availableStations,
      });
    }
  }

  return warnings;
}
