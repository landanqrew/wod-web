import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Trophy } from "lucide-react";
import { requireAthlete } from "@/lib/data/athlete";
import { getPRs, getResult, getWorkout } from "@/lib/data/training";
import { Card, PageHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { WorkoutCard } from "@/components/workout-card";
import { DeleteResultButton } from "./delete-result-button";
import { getMovement } from "@/lib/domain/movements/library";
import {
  EM_DASH,
  formatDate,
  formatPRValue,
  formatScore,
  TIER_LABELS,
} from "@/lib/format";

export default async function ResultDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const athlete = await requireAthlete();
  const result = await getResult(athlete.id, id);
  if (!result) notFound();

  const [workout, prs] = await Promise.all([getWorkout(result.workoutId), getPRs(athlete.id)]);
  const earned = prs.filter((p) => p.workoutResultId === result.id);

  return (
    <>
      <Link
        href="/history"
        className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-muted-fg hover:text-ink"
      >
        <ArrowLeft size={14} /> History
      </Link>

      <PageHeader
        title={workout?.name ?? "Result"}
        subtitle={formatDate(result.performedAt)}
        action={<DeleteResultButton resultId={result.id} />}
      />

      <div className="grid gap-3.5 lg:grid-cols-[1fr_360px] lg:items-start">
        {workout ? (
          <WorkoutCard workout={workout} />
        ) : (
          <Card className="p-5 text-sm text-subtle">This workout is no longer available.</Card>
        )}

        <div className="flex flex-col gap-3.5">
          <Card className="flex flex-col gap-3 p-5">
            <div className="flex flex-col gap-1">
              <span className="stat-key">Score</span>
              <span className="stat-value">{formatScore(result)}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {result.rx ? (
                <Pill tone="rx">Rx</Pill>
              ) : (
                <Pill tone="scaled">
                  {result.scalingTier ? TIER_LABELS[result.scalingTier] : "Scaled"}
                </Pill>
              )}
              {result.rpe ? <Pill tone="neutral">RPE {result.rpe}</Pill> : null}
              {earned.length > 0 ? <Pill tone="pr">PR</Pill> : null}
            </div>
            {result.notes ? (
              <p className="border-t border-border pt-3 text-[13px] text-muted-fg">
                {result.notes}
              </p>
            ) : null}
          </Card>

          {earned.length > 0 ? (
            <Card className="flex flex-col gap-2 p-5">
              <h3 className="flex items-center gap-2 text-[15px] font-bold text-primary">
                <Trophy size={15} /> Records set
              </h3>
              {earned.map((pr) => (
                <div key={pr.id} className="flex items-center justify-between gap-3 text-[13px]">
                  <span className="truncate">
                    {pr.referenceType === "movement"
                      ? (getMovement(pr.referenceId)?.name ?? pr.referenceId)
                      : (workout?.name ?? pr.referenceId)}
                  </span>
                  <span className="shrink-0 font-mono font-semibold">
                    {formatPRValue(pr.value, pr.unit)}
                  </span>
                </div>
              ))}
            </Card>
          ) : null}

          <Card className="p-5">
            <h3 className="mb-2 text-[15px] font-bold">Movement log</h3>
            {result.movementResults.length === 0 ? (
              <p className="text-xs text-subtle">Nothing recorded per movement.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="table-head-cell">Movement</th>
                    <th className="table-head-cell text-right">Reps</th>
                    <th className="table-head-cell text-right">Load</th>
                  </tr>
                </thead>
                <tbody>
                  {result.movementResults.map((m, i) => (
                    <tr key={`${m.movementId}_${i}`} className="border-b border-border last:border-b-0">
                      <td className="px-3 py-1.5">
                        {getMovement(m.movementId)?.name ?? m.movementId}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-[13px]">
                        {m.reps ?? <span className="text-subtle">{EM_DASH}</span>}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-[13px]">
                        {m.load ? `${m.load} lb` : <span className="text-subtle">{EM_DASH}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
