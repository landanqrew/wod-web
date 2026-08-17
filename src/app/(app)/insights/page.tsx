import { requireAthlete } from "@/lib/data/athlete";
import { acwr, loadTrainingSnapshot } from "@/lib/data/analysis";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { DistributionBars, LineChart, RingGauge } from "@/components/charts";
import { InsightCard, toneFor } from "@/components/insight-card";
import { getMovement } from "@/lib/domain/movements/library";
import { formatLabel, formatShortDate, titleCase } from "@/lib/format";

export default async function InsightsPage() {
  const athlete = await requireAthlete();
  const { results, bias, fatigue } = await loadTrainingSnapshot(athlete.id);

  const biasReport = bias.analyze(30);
  const fatigueReport = fatigue.analyze();
  const ratio = acwr(results);

  return (
    <>
      <PageHeader
        title="Insights"
        subtitle={`Bias and fatigue analysis over ${biasReport.periodDays} days · ${biasReport.totalWorkouts} workouts`}
      />

      <div className="grid gap-3.5 xl:grid-cols-2 xl:items-start">
        <div className="flex flex-col gap-3.5">
          <Card className="flex flex-col gap-3 p-5">
            <CardHeader
              title="Programming bias"
              meta="Gaps the generator can fill for you"
              className="px-0 pt-0"
            />
            {biasReport.insights.length === 0 ? (
              <InsightCard tone="ok" message="No bias detected in this window" />
            ) : (
              biasReport.insights.map((insight, i) => (
                <InsightCard
                  key={i}
                  tone={toneFor(insight.severity)}
                  message={insight.message}
                  recommendation={insight.recommendation}
                />
              ))
            )}
          </Card>

          <Card className="p-5">
            <CardHeader title="Modality mix" className="px-0 pt-0" />
            <DistributionBars
              rows={Object.entries(biasReport.modalityDistribution).map(([k, v]) => ({
                label: titleCase(k),
                value: v,
              }))}
            />
          </Card>

          <Card className="p-5">
            <CardHeader title="Muscles trained" className="px-0 pt-0" />
            <DistributionBars
              rows={Object.entries(biasReport.muscleDistribution).map(([k, v]) => ({
                label: titleCase(k),
                value: v,
              }))}
              tone="var(--color-spark)"
            />
          </Card>

          <Card className="p-5">
            <CardHeader title="Movement Pattern mix" className="px-0 pt-0" />
            <DistributionBars
              rows={Object.entries(biasReport.movementPatternDistribution).map(([k, v]) => ({
                label: titleCase(k),
                value: v,
              }))}
              tone="var(--color-spark)"
            />
          </Card>

          <Card className="p-5">
            <CardHeader title="Format mix" className="px-0 pt-0" />
            {Object.keys(biasReport.formatDistribution).length === 0 ? (
              <p className="py-6 text-center text-xs text-subtle">Nothing logged yet.</p>
            ) : (
              <DistributionBars
                rows={Object.entries(biasReport.formatDistribution).map(([k, v]) => ({
                  label: formatLabel(k),
                  value: v,
                }))}
              />
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-3.5">
          <Card className="flex flex-col gap-3 p-5">
            <CardHeader
              title="Fatigue & recovery"
              meta="RPE trend, workload ratio, consecutive days"
              className="px-0 pt-0"
            />
            <div className="flex items-center gap-4 rounded-xl border border-border bg-app p-3.5">
              <RingGauge
                value={ratio ?? 0}
                max={2}
                label={ratio === null ? "—" : ratio.toFixed(1)}
                tone={
                  ratio === null
                    ? "var(--color-border-hi)"
                    : ratio > 1.5
                      ? "var(--color-warn)"
                      : "var(--color-ok)"
                }
              />
              <div className="flex flex-col gap-1">
                <span className="stat-key">Acute : chronic workload</span>
                <span className="text-xs text-muted-fg">
                  7-day volume vs the trailing 28-day weekly average
                </span>
                <span className="text-xs text-subtle">
                  {fatigueReport.recentWorkoutCount} sessions this week · load{" "}
                  {fatigueReport.loadTrend.replace("_", " ")}
                </span>
              </div>
            </div>
            {fatigueReport.insights.length === 0 ? (
              <InsightCard tone="info" message="Not enough RPE data yet" />
            ) : (
              fatigueReport.insights.map((insight, i) => (
                <InsightCard
                  key={i}
                  tone={toneFor(insight.severity)}
                  message={insight.message}
                  recommendation={insight.recommendation}
                />
              ))
            )}
          </Card>

          <Card className="p-5">
            <CardHeader
              title="RPE trend"
              meta={`7-day avg ${fatigueReport.weeklyRpeAvg ?? "—"} · 30-day avg ${fatigueReport.monthlyRpeAvg ?? "—"}`}
              className="px-0 pt-0"
            />
            <LineChart
              points={fatigueReport.rpeTrend.map((p) => ({
                label: formatShortDate(p.date),
                value: p.rpe,
              }))}
              tone="var(--color-warn)"
              height={140}
            />
          </Card>

          <Card className="p-5">
            <CardHeader title="Movement frequency" meta="Top 10 in window" className="px-0 pt-0" />
            {biasReport.movementFrequency.length === 0 ? (
              <p className="py-6 text-center text-xs text-subtle">Nothing logged yet.</p>
            ) : (
              <DistributionBars
                rows={biasReport.movementFrequency.slice(0, 10).map((m) => ({
                  label: getMovement(m.movementId)?.name ?? m.name,
                  value: m.count,
                }))}
                unit=""
              />
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
