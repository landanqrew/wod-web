import { requireAthlete } from "@/lib/data/athlete";
import { getActiveLoadAdjustmentsForAthlete } from "@/lib/training/load-adjustment";
import { AdjustmentsClient } from "./adjustments-client";

export default async function AdjustmentsPage() {
  const athlete = await requireAthlete();
  const adjustments = await getActiveLoadAdjustmentsForAthlete(athlete.id);
  return <AdjustmentsClient adjustments={adjustments} />;
}
