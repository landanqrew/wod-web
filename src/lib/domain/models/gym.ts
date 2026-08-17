import type { Equipment } from "./equipment";

export interface GymFloorEntry {
  equipment: Equipment;
  stationCount?: number;
}

export interface Gym {
  id: string;
  name: string;
  ownerAthleteId: string | null;
  floor: GymFloorEntry[];
}
