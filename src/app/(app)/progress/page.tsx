import Link from "next/link";
import { requireAthlete } from "@/lib/data/athlete";
import { loadTrainingSnapshot, weeklyVolume } from "@/lib/data/analysis";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { BarChart, DistributionBars, DotWeek, LineChart } from "@/components/charts";
import { PRList } from "@/components/pr-list";
import { getMovement } from "@/lib/domain/movements/library";
import { formatNumber, formatShortDate } from "@/lib/format";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function ProgressPage() {
  const athlete = await requireAthlete();
  const { results, workouts, prs, volume } = await loadTrainingSnapshot(athlete.id);

  const month = volume.monthSummary();
  const weeks = weeklyVolume(results, 12);
  const top = month.movementBreakdown.slice(0, 8);

  // Deepest load history wins the featured progression slot.
  const loadSeries = new Map<string, { at: string; value: number }[]>();
  for (const r of results) {
    for (const m of r.movementResults) {
      if (!m.load) continue;
      loadSeries.set(m.movementId, [
        ...(loadSeries.get(m.movementId) ?? []),
        { at: r.performedAt, value: m.load },
      ]);
    }
  }
  const featured = [...loadSeries.entries()].sort((a, b) => b[1].length - a[1].length)[0];

  return (
    <>
      <PageHeader
        title="Progress"
        subtitle={
          <>
            {month.totalWorkouts} sessions in 30 days ·{" "}
            <span className="font-mono">{formatNumber(month.totalVolumeLbs)} lb</span> ·{" "}
            {month.rxWorkouts} Rx
          </>
        }
      />

      <div className="grid gap-3.5 xl:grid-cols-3">
        <Card className="p-5 xl:col-span-2">
          <CardHeader
            title="Weekly volume"
            meta="Total load moved per week — last 12 weeks"
            className="px-0 pt-0"
          />
          <BarChart
            data={weeks.map((w) => ({ label: w.label, value: w.value }))}
            formatValue={(v) => `${formatNumber(v)} lb`}
          />
        </Card>

        <Card className="flex flex-col gap-4 p-5">
          <div>
            <CardHeader title="Training days" meta="Last 30 days" className="px-0 pt-0" />
            <DistributionBars
              rows={month.dayDistribution.map((count, i) => ({
                label: DAY_LABELS[i],
                value: count,
              }))}
              unit=""
            />
          </div>
          <div className="border-t border-border pt-3">
            <span className="stat-key">This week</span>
            <div className="mt-1.5">
              <DotWeek counts={volume.weekSummary().dayDistribution} />
            </div>
          </div>
        </Card>

        <Card className="p-5 xl:col-span-2">
          <CardHeader
            title={
              featured
                ? `${getMovement(featured[0])?.name ?? featured[0]} — load progression`
                : "Load progression"
            }
            meta="Your most-logged loaded movement"
            className="px-0 pt-0"
          />
          {featured ? (
            <LineChart
              points={featured[1]
                .sort((a, b) => a.at.localeCompare(b.at))
                .map((p) => ({ label: formatShortDate(p.at), value: p.value }))}
              yLabel="lb"
            />
          ) : (
            <p className="py-10 text-center text-xs text-subtle">
              Log loads on a movement and the progression shows up here.
            </p>
          )}
          {featured ? (
            <Link
              href={`/movements/${featured[0]}`}
              className="mt-2 inline-block text-[13px] text-primary hover:underline"
            >
              Open movement
            </Link>
          ) : null}
        </Card>

        <Card className="px-4 pt-3.5 pb-3">
          <h3 className="mb-1.5 text-[15px] font-bold">Records</h3>
          <PRList prs={prs} workouts={workouts} limit={10} />
        </Card>

        <Card className="p-5 xl:col-span-3">
          <CardHeader title="Most-trained movements" meta="Last 30 days" className="px-0 pt-0" />
          {top.length === 0 ? (
            <p className="py-8 text-center text-xs text-subtle">No movement data in this window.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="table-head-cell">Movement</th>
                    <th className="table-head-cell text-right">Sets</th>
                    <th className="table-head-cell text-right">Reps</th>
                    <th className="table-head-cell text-right">Max load</th>
                    <th className="table-head-cell text-right">Avg load</th>
                  </tr>
                </thead>
                <tbody>
                  {top.map((m) => (
                    <tr key={m.movementId} className="data-row">
                      <td className="px-3 py-1.5">
                        <Link href={`/movements/${m.movementId}`} className="font-medium">
                          {getMovement(m.movementId)?.name ?? m.movementId}
                        </Link>
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-[13px]">{m.totalSets}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-[13px]">{m.totalReps}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-[13px]">
                        {m.maxLoad || "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-[13px] text-muted-fg">
                        {m.averageLoad ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
