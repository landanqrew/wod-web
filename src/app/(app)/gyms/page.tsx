import { requireAthlete } from "@/lib/data/athlete";
import { getGymsForAthlete } from "@/lib/data/gym";
import { GymsClient } from "./gyms-client";

export default async function GymsPage() {
  const athlete = await requireAthlete();
  const gyms = await getGymsForAthlete(athlete.id);
  return <GymsClient gyms={gyms} />;
}
