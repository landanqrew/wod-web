import Link from "next/link";
import { Zap } from "lucide-react";
import { requireAthlete } from "@/lib/data/athlete";
import { acwr, loadTrainingSnapshot, recentPRs, weeklyVolume } from "@/lib/data/analysis";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DotWeek, RingGauge, Sparkline } from "@/components/charts";
import { ResultsTable } from "@/components/results-table";
import { PRList } from "@/components/pr-list";
import { InsightCard, toneFor } from "@/components/insight-card";
import { formatNumber } from "@/lib/format";

export default async function DashboardPage() {
  const athlete = await requireAthlete();
  const snapshot = await loadTrainingSnapshot(athlete.id);
  const { results, workouts, prs, volume, bias, fatigue } = snapshot;

  const week = volume.weekSummary();
  const weeks = weeklyVolume(results, 8);
  const ratio = acwr(results);
  const biasReport = bias.analyze(30);
  const fatigueReport = fatigue.analyze();

  const priorWeekVolume = weeks[weeks.length - 2]?.value ?? 0;
  const delta =
    priorWeekVolume > 0
      ? Math.round(((week.totalVolumeLbs - priorWeekVolume) / priorWeekVolume) * 100)
      : null;

  const lastMonthPRs = recentPRs(prs, 30);

  const alerts = [
    ...fatigueReport.insights.map((i) => ({
      tone: toneFor(i.severity),
      message: i.message,
      recommendation: i.recommendation,
    })),
    ...biasReport.insights.map((i) => ({
      tone: toneFor(i.severity),
      message: i.message,
      recommendation: i.recommendation,
    })),
  ].slice(0, 4);

  const focus = biasReport.insights.find((i) => i.severity !== "info");

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${athlete.name.split(" ")[0]}`}
        subtitle={
          <>
            {week.totalWorkouts} session{week.totalWorkouts === 1 ? "" : "s"} this week ·{" "}
            <span className="font-mono">{formatNumber(week.totalVolumeLbs)} lb</span> volume
          </>
        }
        action={
          <span className="font-mono text-xs text-subtle max-sm:hidden">
            {new Date().toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
          </span>
        }
      />

      <div className="mb-3.5 grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="flex flex-col gap-1.5 px-4 py-4">
          <span className="stat-key">Weekly volume</span>
          <span className="stat-value">
            {formatNumber(week.totalVolumeLbs)} <small className="text-[13px] text-subtle">lb</small>
          </span>
          <Sparkline values={weeks.map((w) => w.value)} />
          <span
            className={
              delta === null
                ? "text-xs text-subtle"
                : delta >= 0
                  ? "text-xs text-ok"
                  : "text-xs text-danger"
            }
          >
            {delta === null ? "No prior week to compare" : `${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta)}% vs last week`}
          </span>
        </Card>

        <Card className="flex items-center gap-3.5 px-4 py-4">
          <RingGauge
            value={ratio ?? 0}
            max={2}
            label={ratio === null ? "—" : ratio.toFixed(1)}
            tone={
              ratio === null
                ? "var(--color-border-hi)"
                : ratio > 1.5
                  ? "var(--color-warn)"
                  : ratio < 0.8
                    ? "var(--color-subtle)"
                    : "var(--color-ok)"
            }
          />
          <div className="flex min-w-0 flex-col gap-1">
            <span className="stat-key">Load ratio · ACWR</span>
            <span className="text-xs text-muted-fg">
              {ratio === null
                ? "Not enough history"
                : ratio > 1.5
                  ? "Ramping fast"
                  : ratio < 0.8
                    ? "Backing off"
                    : "In the sweet spot"}
            </span>
            <span className="text-xs text-subtle">
              avg RPE {fatigueReport.monthlyRpeAvg ?? "—"} · {fatigueReport.loadTrend.replace("_", " ")}
            </span>
          </div>
        </Card>

        <Card className="flex flex-col gap-1.5 px-4 py-4">
          <span className="stat-key">Sessions · 7 days</span>
          <span className="stat-value">{week.totalWorkouts}</span>
          <DotWeek counts={week.dayDistribution} />
        </Card>

        <Card className="flex flex-col gap-1.5 px-4 py-4">
          <span className="stat-key">PRs · 30 days</span>
          <span className="stat-value">{lastMonthPRs.length}</span>
          <span className="text-xs text-muted-fg">
            {prs.length} lifetime record{prs.length === 1 ? "" : "s"}
          </span>
        </Card>
      </div>

      <div className="mb-3.5 grid gap-3.5 lg:grid-cols-3">
        <Card className="relative flex flex-col gap-2.5 overflow-hidden bg-gradient-to-br from-card from-55% to-primary/7 px-5 py-4 lg:col-span-2">
          <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.09em] text-primary">
            <span className="h-2 w-2 rounded-full bg-spark shadow-[0_0_10px_color-mix(in_srgb,#ff6a2b_60%,transparent)]" />
            Today&apos;s focus
          </span>
          <h2 className="text-[17px] font-bold tracking-tight">
            {focus ? focus.message : "Anything you want — your programming is balanced"}
          </h2>
          <p className="text-[13px] text-muted-fg">
            {focus
              ? focus.recommendation
              : "No gaps in the last 30 days. Pick a format and go."}
          </p>
          {athlete.impediments.length > 0 ? (
            <p className="text-xs text-subtle">
              {athlete.impediments.length} active impediment
              {athlete.impediments.length > 1 ? "s" : ""} — generated work is constrained
              automatically.
            </p>
          ) : null}
          <div className="mt-1 flex gap-2">
            <Link href="/generate">
              <Button variant="primary" size="sm">
                <Zap size={14} strokeWidth={2.4} /> Generate workout
              </Button>
            </Link>
            <Link href="/benchmarks">
              <Button size="sm">Pick a benchmark</Button>
            </Link>
          </div>
        </Card>

        <div className="flex flex-col gap-2.5">
          {alerts.length === 0 ? (
            <InsightCard
              tone="info"
              message="Nothing to flag yet"
              recommendation="Log a few sessions with RPE and the analyzers wake up."
            />
          ) : (
            alerts.map((a, i) => (
              <InsightCard
                key={i}
                tone={a.tone}
                message={a.message}
                recommendation={a.recommendation}
              />
            ))
          )}
        </div>
      </div>

      <div className="grid gap-3.5 xl:grid-cols-[2fr_1fr]">
        <Card className="overflow-hidden">
          <CardHeader
            title="Recent results"
            action={
              <Link href="/history" className="text-[13px] text-primary hover:underline">
                View all
              </Link>
            }
          />
          <ResultsTable results={results.slice(0, 8)} workouts={workouts} prs={prs} />
        </Card>

        <Card className="px-4 pt-3.5 pb-3">
          <h3 className="mb-1.5 text-[15px] font-bold">Recent PRs</h3>
          <PRList prs={prs} workouts={workouts} />
        </Card>
      </div>
    </>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Morning";
  if (hour < 18) return "Afternoon";
  return "Evening";
}
