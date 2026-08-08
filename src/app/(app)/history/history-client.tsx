"use client";

import * as React from "react";
import { Card, PageHeader } from "@/components/ui/card";
import { Segmented } from "@/components/ui/field";
import { ResultsTable } from "@/components/results-table";
import { WorkoutFormat } from "@/lib/domain/models/workout";
import type { Workout } from "@/lib/domain/models/workout";
import type { PersonalRecord, WorkoutResult } from "@/lib/domain/models/workout-result";
import { formatLabel, formatNumber } from "@/lib/format";

type Period = "30" | "90" | "all";
type Kind = "all" | "rx" | "scaled" | "pr";

export function HistoryClient({
  results,
  workouts,
  prs,
}: {
  results: WorkoutResult[];
  workouts: Record<string, Workout>;
  prs: PersonalRecord[];
}) {
  // Frozen once per mount so filtering stays pure across re-renders.
  const [now] = React.useState(() => Date.now());
  const [period, setPeriod] = React.useState<Period>("90");
  const [kind, setKind] = React.useState<Kind>("all");
  const [format, setFormat] = React.useState<string>("all");

  const workoutMap = React.useMemo(() => new Map(Object.entries(workouts)), [workouts]);
  const prResultIds = React.useMemo(
    () => new Set(prs.map((p) => p.workoutResultId).filter(Boolean)),
    [prs]
  );

  const filtered = React.useMemo(() => {
    const cutoff =
      period === "all" ? 0 : now - Number(period) * 86_400_000;
    return results.filter((r) => {
      if (new Date(r.performedAt).getTime() < cutoff) return false;
      if (kind === "rx" && !r.rx) return false;
      if (kind === "scaled" && r.rx) return false;
      if (kind === "pr" && !prResultIds.has(r.id)) return false;
      if (format !== "all" && workoutMap.get(r.workoutId)?.format !== format) return false;
      return true;
    });
  }, [results, now, period, kind, format, prResultIds, workoutMap]);

  const volume = filtered.reduce(
    (sum, r) =>
      sum + r.movementResults.reduce((s, m) => s + (m.load ?? 0) * (m.reps ?? (m.load ? 1 : 0)), 0),
    0
  );

  return (
    <>
      <PageHeader
        title="History"
        subtitle={
          <>
            {filtered.length} result{filtered.length === 1 ? "" : "s"} ·{" "}
            <span className="font-mono">{formatNumber(volume)} lb</span> moved
          </>
        }
      />

      <div className="mb-3.5 flex flex-wrap items-center gap-2">
        <Segmented
          value={period}
          onChange={setPeriod}
          options={[
            { value: "30", label: "30 days" },
            { value: "90", label: "90 days" },
            { value: "all", label: "All" },
          ]}
        />
        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { value: "all", label: "All" },
            { value: "rx", label: "Rx" },
            { value: "scaled", label: "Scaled" },
            { value: "pr", label: "PRs" },
          ]}
        />
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value)}
          className="h-9 cursor-pointer rounded-full border border-border bg-app px-3.5 text-[13px] text-muted-fg outline-none focus:ring-2 focus:ring-primary/25"
        >
          <option value="all">Any format</option>
          {Object.values(WorkoutFormat).map((f) => (
            <option key={f} value={f}>
              {formatLabel(f)}
            </option>
          ))}
        </select>
      </div>

      <Card className="overflow-hidden">
        <ResultsTable
          results={filtered}
          workouts={workoutMap}
          prs={prs}
          emptyHint="Nothing matches these filters."
        />
      </Card>
    </>
  );
}
