import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAthlete } from "@/lib/data/athlete";
import { getPRs, getResults } from "@/lib/data/training";
import { getMovement } from "@/lib/domain/movements/library";
import { checkMovement, mergeConstraints } from "@/lib/domain/scaling/constraint-engine";
import { Card, PageHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { InsightCard } from "@/components/insight-card";
import { LineChart } from "@/components/charts";
import { EM_DASH, formatPRValue, formatShortDate, titleCase } from "@/lib/format";

export default async function MovementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const movement = getMovement(id);
  if (!movement) notFound();

  const athlete = await requireAthlete();
  const [results, prs] = await Promise.all([getResults(athlete.id), getPRs(athlete.id)]);

  const check = checkMovement(
    movement,
    mergeConstraints(athlete.impediments),
    athlete.equipment
  );

  // Load progression: heaviest load recorded for this movement per session.
  const points = results
    .flatMap((r) =>
      r.movementResults
        .filter((m) => m.movementId === movement.id && m.load)
        .map((m) => ({ at: r.performedAt, value: m.load! }))
    )
    .sort((a, b) => a.at.localeCompare(b.at))
    .map((p) => ({ label: formatShortDate(p.at), value: p.value }));

  const movementPRs = prs.filter((p) => p.referenceId === movement.id);

  return (
    <>
      <Link
        href="/movements"
        className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-muted-fg hover:text-ink"
      >
        <ArrowLeft size={14} /> Movements
      </Link>

      <PageHeader
        title={movement.name}
        subtitle={movement.description ?? titleCase(movement.modality)}
      />

      <div className="mb-3.5">
        {check.allowed ? (
          check.warnings.length > 0 ? (
            <InsightCard
              tone="warn"
              message="Allowed with modifications"
              recommendation={check.warnings.join(" · ")}
            />
          ) : (
            <InsightCard tone="ok" message="Available with your equipment and constraints" />
          )
        ) : (
          <InsightCard
            tone="danger"
            message="Excluded from generated workouts"
            recommendation={check.reasons.join(" · ")}
          />
        )}
      </div>

      <div className="grid gap-3.5 lg:grid-cols-[1fr_340px] lg:items-start">
        <Card className="p-5">
          <h3 className="mb-3 text-[15px] font-bold">Load progression</h3>
          <LineChart
            points={points}
            yLabel="lb"
            formatValue={(v) => `${v}`}
          />
        </Card>

        <div className="flex flex-col gap-3.5">
          <Card className="flex flex-col gap-3 p-5">
            <h3 className="text-[15px] font-bold">Profile</h3>
            <Row label="Modality" value={titleCase(movement.modality)} />
            <Row label="Difficulty" value={movement.difficulty.replace("_", "+")} />
            <Row label="Load type" value={titleCase(movement.loadType)} />
            <Row
              label="Rx load (M / F)"
              value={
                movement.defaultLoadMale
                  ? `${movement.defaultLoadMale} / ${movement.defaultLoadFemale ?? EM_DASH} lb`
                  : EM_DASH
              }
              mono
            />
            <div className="flex flex-col gap-1.5 border-t border-border pt-3">
              <span className="stat-key">Primary regions</span>
              <span className="flex flex-wrap gap-1.5">
                {movement.primaryRegions.map((r) => (
                  <Pill key={r} tone="neutral">
                    {titleCase(r)}
                  </Pill>
                ))}
              </span>
            </div>
            {movement.tags.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                <span className="stat-key">Tags</span>
                <span className="flex flex-wrap gap-1.5">
                  {movement.tags.map((t) => (
                    <Pill key={t} tone="format">
                      {t.replace(/_/g, " ")}
                    </Pill>
                  ))}
                </span>
              </div>
            ) : null}
          </Card>

          <Card className="flex flex-col gap-2 p-5">
            <h3 className="text-[15px] font-bold">Substitution chain</h3>
            <p className="text-xs text-subtle">Easiest first — what the scaling engine walks.</p>
            <div className="flex flex-wrap gap-1.5">
              {movement.substitutions.length === 0 ? (
                <span className="text-xs text-subtle">{EM_DASH}</span>
              ) : (
                movement.substitutions.map((s) => (
                  <Link key={s} href={`/movements/${s}`}>
                    <Pill tone="rx">{getMovement(s)?.name ?? s}</Pill>
                  </Link>
                ))
              )}
            </div>
          </Card>

          <Card className="flex flex-col gap-2 p-5">
            <h3 className="text-[15px] font-bold">Your records</h3>
            {movementPRs.length === 0 ? (
              <p className="text-xs text-subtle">No records for this movement yet.</p>
            ) : (
              movementPRs.map((pr) => (
                <div key={pr.id} className="flex items-center justify-between text-[13px]">
                  <span className="text-muted-fg">{titleCase(pr.category)}</span>
                  <span className="font-mono font-semibold">
                    {formatPRValue(pr.value, pr.unit)}
                  </span>
                </div>
              ))
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 text-[13px]">
      <span className="text-muted-fg">{label}</span>
      <span className={mono ? "font-mono" : undefined}>{value}</span>
    </div>
  );
}
