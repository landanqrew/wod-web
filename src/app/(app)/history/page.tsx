import { requireAthlete } from "@/lib/data/athlete";
import { loadTrainingSnapshot } from "@/lib/data/analysis";
import { HistoryClient } from "./history-client";

export default async function HistoryPage() {
  const athlete = await requireAthlete();
  const { results, workouts, prs } = await loadTrainingSnapshot(athlete.id);

  return (
    <HistoryClient
      results={results}
      workouts={Object.fromEntries(workouts)}
      prs={prs}
    />
  );
}
