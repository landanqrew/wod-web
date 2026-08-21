"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trophy } from "lucide-react";
import { SidePane } from "@/components/ui/side-pane";
import { Button } from "@/components/ui/button";
import { FieldRow, Input, Label, Select, Textarea, Toggle } from "@/components/ui/field";
import { logAssignedWorkoutResultAction, logResultAction } from "@/lib/actions/training";
import { ScoreType } from "@/lib/domain/models/workout";
import type { Workout } from "@/lib/domain/models/workout";
import { DifficultyTier } from "@/lib/domain/models/movement";
import { getMovement } from "@/lib/domain/movements/library";
import { formatPRValue, parseClock, TIER_LABELS } from "@/lib/format";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
  workout: Workout;
  /** Pass true when the workout isn't persisted yet (freshly generated). */
  persistWorkout?: boolean;
  scalingTier?: DifficultyTier;
  classSessionId?: string;
};

export function LogResultPane({ open, onClose, workout, persistWorkout, scalingTier, classSessionId }: Props) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [rx, setRx] = React.useState(true);
  const [tier, setTier] = React.useState<DifficultyTier>(scalingTier ?? DifficultyTier.Rx);
  const [rpe, setRpe] = React.useState<number | undefined>();
  const [notes, setNotes] = React.useState("");
  const [score, setScore] = React.useState<Record<string, string>>({});
  const [loads, setLoads] = React.useState<Record<string, string>>(
    Object.fromEntries(workout.movements.map((m) => [m.movementId, m.load ? String(m.load) : ""]))
  );

  const setScoreField = (key: string, value: string) => setScore((prev) => ({ ...prev, [key]: value }));

  async function save() {
    setPending(true);
    try {
      const input = {
        workout: persistWorkout ? stripWorkout(workout) : undefined,
        workoutId: workout.id,
        performedAt: new Date().toISOString(),
        scoreType: workout.scoreType,
        ...scoreFields(workout.scoreType, score),
        rpe,
        rx,
        scalingTier: rx ? undefined : tier,
        movementResults: workout.movements.map((m) => ({
          movementId: m.movementId,
          load: loads[m.movementId] ? Number(loads[m.movementId]) : undefined,
          reps: m.reps,
          rx,
        })),
        notes: notes || undefined,
      };
      const { prs } = classSessionId
        ? await logAssignedWorkoutResultAction(classSessionId, input)
        : await logResultAction(input);

      if (prs.length > 0) {
        for (const pr of prs) {
          const label =
            pr.referenceType === "movement" ? (getMovement(pr.referenceId)?.name ?? pr.referenceId) : workout.name;
          toast.custom(() => (
            <div className="animate-pr-pop flex items-center gap-3 rounded-2xl border border-primary/50 bg-primary px-4 py-3 text-on-primary shadow-glow">
              <Trophy size={20} strokeWidth={2.4} />
              <div>
                <b className="block text-sm font-extrabold">New PR — {label}</b>
                <span className="font-mono text-[13px]">
                  {formatPRValue(pr.value, pr.unit)}
                  {pr.previousValue !== undefined ? (
                    <span className="opacity-70"> (was {formatPRValue(pr.previousValue, pr.unit)})</span>
                  ) : null}
                </span>
              </div>
            </div>
          ));
        }
      } else {
        toast.success("Result logged");
      }

      onClose();
      router.refresh();
    } catch {
      toast.error("Could not save the result");
    } finally {
      setPending(false);
    }
  }

  return (
    <SidePane
      open={open}
      onClose={onClose}
      title={`Log — ${workout.name}`}
      subtitle={new Date().toLocaleDateString("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric",
      })}
      footer={
        <>
          <Button onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save result"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <ScoreInputs scoreType={workout.scoreType} score={score} onChange={setScoreField} />

        <div className="flex flex-col gap-2">
          <Label>RPE</Label>
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRpe(rpe === n ? undefined : n)}
                className={cn(
                  "h-8 w-8 cursor-pointer rounded-full border font-mono text-[13px] transition",
                  rpe === n
                    ? n >= 9
                      ? "border-danger/50 bg-danger/20 text-danger"
                      : "border-primary/50 bg-primary text-on-primary font-semibold"
                    : "border-border-hi text-muted-fg hover:bg-muted hover:text-ink"
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-border p-3.5">
          <Toggle checked={rx} onChange={setRx} label="Completed as prescribed (Rx)" />
          {!rx ? (
            <FieldRow label="Scaling tier">
              <Select value={tier} onChange={(e) => setTier(e.target.value as DifficultyTier)}>
                {Object.values(DifficultyTier).map((t) => (
                  <option key={t} value={t}>
                    {TIER_LABELS[t]}
                  </option>
                ))}
              </Select>
            </FieldRow>
          ) : null}
        </div>

        {workout.movements.length > 0 ? (
          <div className="flex flex-col gap-2">
            <Label>Loads used</Label>
            <div className="flex flex-col gap-1.5">
              {workout.movements.map((m) => {
                const movement = m.movement ?? getMovement(m.movementId);
                return (
                  <div key={m.movementId} className="flex items-center gap-3">
                    <span className="min-w-0 flex-1 truncate text-[13px]">{movement?.name ?? m.movementId}</span>
                    <Input
                      type="number"
                      inputMode="numeric"
                      placeholder="lb"
                      value={loads[m.movementId] ?? ""}
                      onChange={(e) =>
                        setLoads((prev) => ({
                          ...prev,
                          [m.movementId]: e.target.value,
                        }))
                      }
                      className="w-24 py-1.5 text-right font-mono text-[13px]"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        <FieldRow label="Notes">
          <Textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="How did it feel? Anything you'd change?"
          />
        </FieldRow>
      </div>
    </SidePane>
  );
}

function ScoreInputs({
  scoreType,
  score,
  onChange,
}: {
  scoreType: ScoreType;
  score: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  const big = "h-14 text-center font-mono text-[26px] font-bold";

  switch (scoreType) {
    case ScoreType.Time:
      return (
        <FieldRow label="Time" hint="mm:ss">
          <Input
            autoFocus
            placeholder="8:42"
            value={score.time ?? ""}
            onChange={(e) => onChange("time", e.target.value)}
            className={big}
          />
        </FieldRow>
      );
    case ScoreType.RoundsAndReps:
      return (
        <div className="grid grid-cols-2 gap-3">
          <FieldRow label="Rounds">
            <Input
              autoFocus
              type="number"
              min={0}
              value={score.rounds ?? ""}
              onChange={(e) => onChange("rounds", e.target.value)}
              className={big}
            />
          </FieldRow>
          <FieldRow label="+ Reps">
            <Input
              type="number"
              min={0}
              value={score.reps ?? ""}
              onChange={(e) => onChange("reps", e.target.value)}
              className={big}
            />
          </FieldRow>
        </div>
      );
    case ScoreType.Load:
      return (
        <FieldRow label="Peak load" hint="lb">
          <Input
            autoFocus
            type="number"
            min={0}
            value={score.load ?? ""}
            onChange={(e) => onChange("load", e.target.value)}
            className={big}
          />
        </FieldRow>
      );
    case ScoreType.Reps:
      return (
        <FieldRow label="Total reps">
          <Input
            autoFocus
            type="number"
            min={0}
            value={score.totalReps ?? ""}
            onChange={(e) => onChange("totalReps", e.target.value)}
            className={big}
          />
        </FieldRow>
      );
    case ScoreType.Calories:
      return (
        <FieldRow label="Calories">
          <Input
            autoFocus
            type="number"
            min={0}
            value={score.calories ?? ""}
            onChange={(e) => onChange("calories", e.target.value)}
            className={big}
          />
        </FieldRow>
      );
    case ScoreType.Distance:
      return (
        <FieldRow label="Distance" hint="meters">
          <Input
            autoFocus
            type="number"
            min={0}
            value={score.distance ?? ""}
            onChange={(e) => onChange("distance", e.target.value)}
            className={big}
          />
        </FieldRow>
      );
    default:
      return (
        <p className="rounded-lg border border-dashed border-border-hi px-3 py-4 text-center text-xs text-subtle">
          This workout isn&apos;t scored — just log RPE and notes.
        </p>
      );
  }
}

function num(value?: string): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : undefined;
}

function scoreFields(scoreType: ScoreType, score: Record<string, string>) {
  switch (scoreType) {
    case ScoreType.Time:
      return { timeSeconds: score.time ? parseClock(score.time) : undefined };
    case ScoreType.RoundsAndReps:
      return {
        roundsCompleted: num(score.rounds),
        partialReps: num(score.reps),
      };
    case ScoreType.Load:
      return { peakLoad: num(score.load) };
    case ScoreType.Reps:
      return { totalReps: num(score.totalReps) };
    case ScoreType.Calories:
      return { totalCalories: num(score.calories) };
    case ScoreType.Distance:
      return { totalDistance: num(score.distance) };
    default:
      return {};
  }
}

/** Server-side zod rejects the hydrated `movement` object — send prescriptions only. */
function stripWorkout(workout: Workout): Workout {
  return {
    ...workout,
    movements: workout.movements.map(({ movement: _movement, ...rest }) => rest),
  };
}
