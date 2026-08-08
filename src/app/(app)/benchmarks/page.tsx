import Link from "next/link";
import { requireAthlete } from "@/lib/data/athlete";
import { getResults } from "@/lib/data/training";
import { BENCHMARK_LIBRARY } from "@/lib/domain/generator/benchmark-library";
import type { BenchmarkCategory } from "@/lib/domain/generator/benchmark-library";
import { Card, PageHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { EM_DASH, formatLabel, formatScore, relativeDay } from "@/lib/format";
import type { WorkoutResult } from "@/lib/domain/models/workout-result";
import { bestResult } from "@/lib/score";

const GROUPS: { key: BenchmarkCategory | "other"; label: string; blurb: string }[] = [
  { key: "girl", label: "The Girls", blurb: "The classic benchmark WODs" },
  { key: "hero", label: "Heroes", blurb: "Longer, heavier, named for the fallen" },
  { key: "other", label: "Other", blurb: "Open and community standards" },
];

export default async function BenchmarksPage() {
  const athlete = await requireAthlete();
  const results = await getResults(athlete.id);

  const byWorkout = new Map<string, WorkoutResult[]>();
  for (const r of results) {
    byWorkout.set(r.workoutId, [...(byWorkout.get(r.workoutId) ?? []), r]);
  }

  return (
    <>
      <PageHeader
        title="Benchmarks"
        subtitle={`${BENCHMARK_LIBRARY.length} named workouts · your attempts and bests`}
      />

      <div className="flex flex-col gap-5">
        {GROUPS.map((group) => {
          const items = BENCHMARK_LIBRARY.filter((b) =>
            group.key === "other" ? b.category !== "girl" && b.category !== "hero" : b.category === group.key
          );
          if (items.length === 0) return null;

          return (
            <section key={group.key}>
              <div className="mb-2 flex items-baseline gap-3">
                <h2 className="text-[15px] font-bold">{group.label}</h2>
                <span className="text-xs text-subtle">{group.blurb}</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((benchmark) => {
                  const attempts = byWorkout.get(benchmark.id) ?? [];
                  const best = bestResult(attempts);
                  return (
                    <Link key={benchmark.id} href={`/benchmarks/${benchmark.id}`}>
                      <Card className="flex h-full flex-col gap-2 p-4 transition hover:border-border-hi hover:bg-card-hi">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-bold tracking-tight">{benchmark.name}</h3>
                          <Pill tone="format">{formatLabel(benchmark.format)}</Pill>
                        </div>
                        <p className="line-clamp-2 text-xs text-muted-fg">
                          {benchmark.description}
                        </p>
                        <div className="mt-auto flex items-baseline justify-between gap-2 border-t border-border pt-2.5">
                          <span className="text-[11px] uppercase tracking-[0.07em] text-subtle">
                            {attempts.length
                              ? `${attempts.length} attempt${attempts.length > 1 ? "s" : ""} · ${relativeDay(attempts[0].performedAt)}`
                              : "Never attempted"}
                          </span>
                          <span className="font-mono text-[13px] font-semibold">
                            {best ? formatScore(best) : <span className="text-subtle">{EM_DASH}</span>}
                          </span>
                        </div>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
