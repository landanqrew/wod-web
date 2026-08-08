import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAthlete } from "@/lib/data/athlete";
import { getResults } from "@/lib/data/training";
import { getBenchmark } from "@/lib/domain/generator/benchmark-library";
import { hydrateWorkout } from "@/lib/data/training";
import { Card, PageHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { WorkoutCard } from "@/components/workout-card";
import { BenchmarkActions } from "./benchmark-actions";
import { LineChart } from "@/components/charts";
import { ScoreType } from "@/lib/domain/models/workout";
import { EM_DASH, formatDate, formatScore, formatShortDate } from "@/lib/format";
import { bestResult } from "@/lib/score";

export default async function BenchmarkDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const benchmark = getBenchmark(id);
  if (!benchmark) notFound();

  const athlete = await requireAthlete();
  const results = await getResults(athlete.id);
  const attempts = results.filter((r) => r.workoutId === benchmark.id);
  const workout = hydrateWorkout(benchmark);

  const points = [...attempts]
    .reverse()
    .map((a) => ({
      label: formatShortDate(a.performedAt),
      value:
        a.scoreType === ScoreType.Time
          ? (a.timeSeconds ?? 0)
          : (a.roundsCompleted ?? 0) * 1000 +
            (a.partialReps ?? 0) +
            (a.peakLoad ?? 0) +
            (a.totalReps ?? 0),
    }))
    .filter((p) => p.value > 0);

  return (
    <>
      <Link
        href="/benchmarks"
        className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-muted-fg hover:text-ink"
      >
        <ArrowLeft size={14} /> Benchmarks
      </Link>

      <PageHeader
        title={benchmark.name}
        subtitle={benchmark.description}
        action={<BenchmarkActions workout={workout} />}
      />

      <div className="grid gap-3.5 lg:grid-cols-[1fr_360px] lg:items-start">
        <WorkoutCard workout={workout} headerRight={<Pill tone="rx">Benchmark</Pill>} />

        <div className="flex flex-col gap-3.5">
          <Card className="p-5">
            <h3 className="mb-3 text-[15px] font-bold">Attempt history</h3>
            {attempts.length === 0 ? (
              <p className="text-xs text-subtle">
                Never attempted. Log it once and every future run gets compared automatically.
              </p>
            ) : (
              <>
                <LineChart
                  points={points}
                  formatValue={(v) =>
                    benchmark.scoreType === ScoreType.Time
                      ? `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`
                      : String(v)
                  }
                  height={120}
                />
                <div className="mt-3 flex flex-col divide-y divide-border border-t border-border">
                  {attempts.map((a) => (
                    <Link
                      key={a.id}
                      href={`/history/${a.id}`}
                      className="flex items-center justify-between gap-3 py-2 text-[13px] hover:text-primary"
                    >
                      <span className="font-mono text-muted-fg">{formatDate(a.performedAt)}</span>
                      <span className="flex items-center gap-2">
                        {a.rx ? <Pill tone="rx">Rx</Pill> : <Pill tone="scaled">Scaled</Pill>}
                        <b className="font-mono font-semibold">{formatScore(a)}</b>
                      </span>
                    </Link>
                  ))}
                </div>
              </>
            )}
          </Card>

          <Card className="flex flex-col gap-2 p-5">
            <span className="stat-key">Best</span>
            <span className="stat-value">
              {attempts.length ? formatScore(bestResult(attempts)!) : EM_DASH}
            </span>
            <span className="text-xs text-subtle">
              {attempts.length} attempt{attempts.length === 1 ? "" : "s"} logged
            </span>
          </Card>
        </div>
      </div>
    </>
  );
}
