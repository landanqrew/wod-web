import { requireAthlete } from "@/lib/data/athlete";
import { getBenchmarkWorkouts } from "@/lib/data/training";
import { GenerateClient } from "./generate-client";
import {
  filterAllowedMovements,
  mergeConstraints,
} from "@/lib/domain/scaling/constraint-engine";
import { getAllMovements } from "@/lib/domain/movements";
import { titleCase } from "@/lib/format";

export default async function GeneratePage() {
  const athlete = await requireAthlete();
  const benchmarks = await getBenchmarkWorkouts();
  const constraints = mergeConstraints(athlete.impediments);
  const allowedMovementIds = filterAllowedMovements(
    getAllMovements(),
    constraints,
    athlete.equipment,
  ).map(({ id }) => id);

  const constraintNote = constraints
    ? [
        athlete.impediments.map((i) => titleCase(i.category)).join(", "),
        constraints.maxLoadPercent !== undefined
          ? `loads capped at ${constraints.maxLoadPercent}%`
          : null,
        constraints.avoidMuscles.length || constraints.avoidJoints.length
          ? `avoiding ${[
              ...constraints.avoidMuscles,
              ...constraints.avoidJoints,
            ]
              .map(titleCase)
              .join(", ")
              .toLowerCase()}`
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
      athleteSex={athlete.sex}
      allowedMovementIds={allowedMovementIds}
    />
  );
}
