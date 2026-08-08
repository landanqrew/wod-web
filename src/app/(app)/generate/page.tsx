import { requireAthlete } from "@/lib/data/athlete";
import { getBenchmarkWorkouts } from "@/lib/data/training";
import { GenerateClient } from "./generate-client";
import { mergeConstraints } from "@/lib/domain/scaling/constraint-engine";
import { titleCase } from "@/lib/format";

export default async function GeneratePage() {
  const athlete = await requireAthlete();
  const benchmarks = await getBenchmarkWorkouts();
  const constraints = mergeConstraints(athlete.impediments);

  const constraintNote = constraints
    ? [
        athlete.impediments.map((i) => titleCase(i.category)).join(", "),
        constraints.maxLoadPercent !== undefined
          ? `loads capped at ${constraints.maxLoadPercent}%`
          : null,
        constraints.avoidRegions.length
          ? `avoiding ${constraints.avoidRegions.map(titleCase).join(", ").toLowerCase()}`
          : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;

  return (
    <GenerateClient
      benchmarks={benchmarks}
      constraintNote={constraintNote}
      defaultDuration={athlete.preferredDuration ?? 60}
    />
  );
}
