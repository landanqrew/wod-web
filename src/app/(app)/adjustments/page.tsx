import { requireAthlete } from "@/lib/data/athlete";
import { getActiveLoadAdjustmentsForAthlete } from "@/lib/training/load-adjustment";
import { AdjustmentsClient } from "./adjustments-client";

export default async function AdjustmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ newImpediment?: string }>;
}) {
  const athlete = await requireAthlete();
  const adjustments = await getActiveLoadAdjustmentsForAthlete(athlete.id);
  const query = await searchParams;
  return (
    <AdjustmentsClient
      adjustments={adjustments}
      showImpedimentForm={query.newImpediment === "1"}
    />
  );
}
