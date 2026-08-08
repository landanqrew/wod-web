"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dices, Layers, RefreshCw, Save, Zap } from "lucide-react";
import { Card, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChipToggle, FieldRow, Input, Label, Select } from "@/components/ui/field";
import { Pill } from "@/components/ui/pill";
import { WorkoutCard } from "@/components/workout-card";
import { SessionView } from "@/components/session-view";
import { LogResultPane } from "@/components/log-result-pane";
import {
  buildSessionAction,
  generateWorkoutAction,
  saveSessionAction,
  saveWorkoutAction,
  scaleWorkoutAction,
} from "@/lib/actions/training";
import { WorkoutFormat } from "@/lib/domain/models/workout";
import type { TrainingSession, Workout } from "@/lib/domain/models/workout";
import { DifficultyTier } from "@/lib/domain/models/movement";
import type { ScaledWorkout } from "@/lib/domain/scaling/scaling-tiers";
import { formatLabel, TIER_LABELS } from "@/lib/format";
import { cn } from "@/lib/utils";

const FORMATS = Object.values(WorkoutFormat);
const TIERS = Object.values(DifficultyTier);

export function GenerateClient({
  benchmarks,
  constraintNote,
  defaultDuration,
}: {
  benchmarks: Workout[];
  constraintNote: string | null;
  defaultDuration: number;
}) {
  const router = useRouter();
  const [format, setFormat] = React.useState<WorkoutFormat>(WorkoutFormat.AMRAP);
  const [movementCount, setMovementCount] = React.useState(3);
  const [timeCap, setTimeCap] = React.useState(12);
  const [rounds, setRounds] = React.useState(5);
  const [benchmarkId, setBenchmarkId] = React.useState("");
  const [pending, setPending] = React.useState(false);

  const [base, setBase] = React.useState<Workout | null>(null);
  const [tiers, setTiers] = React.useState<ScaledWorkout[] | null>(null);
  const [tier, setTier] = React.useState<DifficultyTier>(DifficultyTier.Rx);
  const [session, setSession] = React.useState<TrainingSession | null>(null);
  const [logging, setLogging] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  const active =
    tiers?.find((t) => t.tier === tier)?.workout ??
    (tier === DifficultyTier.Rx ? base : null) ??
    base;
  const activeNotes = tiers?.find((t) => t.tier === tier)?.scalingNotes ?? [];

  function reset(workout: Workout | null) {
    setBase(workout);
    setTiers(null);
    setTier(DifficultyTier.Rx);
    setSession(null);
    setSaved(false);
  }

  async function generate() {
    setPending(true);
    try {
      if (benchmarkId) {
        const benchmark = benchmarks.find((b) => b.id === benchmarkId);
        if (benchmark) {
          reset(benchmark);
          setSaved(true); // benchmarks are already persisted
          return;
        }
      }
      const workout = await generateWorkoutAction({
        format,
        movementCount,
        timeCap: needsTimeCap(format) ? timeCap : undefined,
        rounds: needsRounds(format) ? rounds : undefined,
        emomMinutes: format === WorkoutFormat.EMOM ? timeCap : undefined,
      });
      reset(workout);
    } catch {
      toast.error("Could not generate a workout with those constraints");
    } finally {
      setPending(false);
    }
  }

  async function showTiers() {
    if (!base) return;
    setPending(true);
    try {
      setTiers(await scaleWorkoutAction(stripped(base)));
      toast.success("Scaled to all five tiers");
    } catch {
      toast.error("Could not build the scaled versions");
    } finally {
      setPending(false);
    }
  }

  async function buildFullSession() {
    if (!active) return;
    setPending(true);
    try {
      const result = await buildSessionAction(stripped(active));
      setSession(result.session);
    } catch {
      toast.error("Could not build the session");
    } finally {
      setPending(false);
    }
  }

  async function save() {
    if (!active) return;
    setPending(true);
    try {
      if (session) {
        await saveSessionAction({
          date: new Date().toISOString().slice(0, 10),
          blocks: session.blocks.map((b) => ({
            ...b,
            workout: b.workout ? stripped(b.workout) : undefined,
          })),
          totalDurationMinutes: session.totalDurationMinutes,
        });
        toast.success("Session saved");
      } else {
        await saveWorkoutAction(stripped(active));
        toast.success("Workout saved");
      }
      setSaved(true);
      router.refresh();
    } catch {
      toast.error("Could not save");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Generate"
        subtitle="Constraint-aware programming — equipment and impediments are applied before a single movement is picked."
      />

      <div className="grid gap-3.5 xl:grid-cols-[380px_1fr] xl:items-start">
        <Card className="flex flex-col gap-4 p-5">
          <div className="flex flex-col gap-2">
            <Label>Format</Label>
            <div className="flex flex-wrap gap-1.5">
              {FORMATS.map((f) => (
                <ChipToggle
                  key={f}
                  active={!benchmarkId && format === f}
                  onClick={() => {
                    setBenchmarkId("");
                    setFormat(f);
                  }}
                >
                  {formatLabel(f)}
                </ChipToggle>
              ))}
              <ChipToggle
                active={false}
                onClick={() => {
                  setBenchmarkId("");
                  setFormat(FORMATS[Math.floor(Math.random() * FORMATS.length)]);
                }}
              >
                <span className="inline-flex items-center gap-1.5">
                  <Dices size={13} /> Surprise me
                </span>
              </ChipToggle>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FieldRow label="Movements">
              <Input
                type="number"
                min={1}
                max={10}
                className="font-mono"
                value={movementCount}
                onChange={(e) => setMovementCount(Number(e.target.value))}
                disabled={!!benchmarkId}
              />
            </FieldRow>
            <FieldRow label={format === WorkoutFormat.EMOM ? "Minutes" : "Time cap"}>
              <Input
                type="number"
                min={1}
                max={90}
                className="font-mono"
                value={timeCap}
                onChange={(e) => setTimeCap(Number(e.target.value))}
                disabled={!!benchmarkId || (!needsTimeCap(format) && format !== WorkoutFormat.EMOM)}
              />
            </FieldRow>
          </div>

          {needsRounds(format) ? (
            <FieldRow label="Rounds">
              <Input
                type="number"
                min={1}
                max={50}
                className="font-mono"
                value={rounds}
                onChange={(e) => setRounds(Number(e.target.value))}
                disabled={!!benchmarkId}
              />
            </FieldRow>
          ) : null}

          <FieldRow label="Or pick a benchmark" hint="Overrides the settings above">
            <Select value={benchmarkId} onChange={(e) => setBenchmarkId(e.target.value)}>
              <option value="">—</option>
              {benchmarks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </FieldRow>

          {constraintNote ? (
            <p className="rounded-lg border border-dashed border-warn/35 bg-warn/8 px-3 py-2.5 text-xs text-warn">
              {constraintNote}. Movements that stress those areas are excluded automatically.
            </p>
          ) : null}

          <Button variant="primary" onClick={generate} disabled={pending} className="w-full">
            <Zap size={15} strokeWidth={2.4} />
            {pending ? "Working…" : base ? "Generate again" : "Generate workout"}
          </Button>
          <p className="text-center text-[11px] text-subtle">
            Sessions run {defaultDuration} min by default — build one from any workout.
          </p>
        </Card>

        <div className="flex flex-col gap-3.5">
          {!active ? (
            <Card className="flex flex-col items-center gap-2 px-6 py-20 text-center">
              <p className="text-sm font-medium text-muted-fg">Nothing generated yet</p>
              <p className="max-w-sm text-xs text-subtle">
                Pick a format and hit generate. Every movement is filtered against your
                equipment and active impediments first.
              </p>
            </Card>
          ) : (
            <>
              <WorkoutCard
                workout={active}
                headerRight={
                  <div className="flex shrink-0 gap-1.5">
                    {saved ? <Pill tone="ok">Saved</Pill> : null}
                    {active.isBenchmark ? <Pill tone="rx">Benchmark</Pill> : null}
                  </div>
                }
                note={
                  tiers ? (
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-wrap gap-1">
                        {TIERS.map((t) => (
                          <button
                            key={t}
                            onClick={() => setTier(t)}
                            className={cn(
                              "cursor-pointer rounded-full px-3 py-1 text-[12px] transition",
                              tier === t
                                ? "bg-primary font-semibold text-on-primary"
                                : "text-muted-fg hover:bg-muted hover:text-ink"
                            )}
                          >
                            {TIER_LABELS[t]}
                          </button>
                        ))}
                      </div>
                      {activeNotes.filter((n) => n.changes.length > 0).length > 0 ? (
                        <ul className="rounded-lg border border-warn/30 bg-warn/8 px-3 py-2 text-[12px] text-warn">
                          {activeNotes
                            .filter((n) => n.changes.length > 0)
                            .map((n) => (
                              <li key={n.originalId}>
                                {n.originalName} → {n.tieredMovementName} (
                                {n.changes.map((c) => c.replace(/_/g, " ")).join(", ")})
                              </li>
                            ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : null
                }
                footer={
                  <>
                    <Button size="sm" onClick={generate} disabled={pending}>
                      <RefreshCw size={14} /> Regenerate
                    </Button>
                    <Button size="sm" onClick={showTiers} disabled={pending || !!tiers}>
                      <Layers size={14} /> Scaled versions
                    </Button>
                    <Button size="sm" onClick={buildFullSession} disabled={pending || !!session}>
                      Build full session
                    </Button>
                    <Button size="sm" onClick={save} disabled={pending}>
                      <Save size={14} /> Save
                    </Button>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => setLogging(true)}
                      className="ml-auto"
                    >
                      Log result
                    </Button>
                  </>
                }
              />

              {session ? <SessionView session={session} /> : null}
            </>
          )}
        </div>
      </div>

      {active ? (
        <LogResultPane
          open={logging}
          onClose={() => setLogging(false)}
          workout={active}
          persistWorkout={!saved}
          scalingTier={tiers ? tier : undefined}
        />
      ) : null}
    </>
  );
}

function needsTimeCap(format: WorkoutFormat) {
  return [
    WorkoutFormat.AMRAP,
    WorkoutFormat.ForTime,
    WorkoutFormat.RoundsForTime,
    WorkoutFormat.Chipper,
    WorkoutFormat.Ladder,
  ].includes(format);
}

function needsRounds(format: WorkoutFormat) {
  return format === WorkoutFormat.RoundsForTime;
}

function stripped(workout: Workout): Workout {
  return {
    ...workout,
    movements: workout.movements.map(({ movement: _movement, ...rest }) => rest),
  };
}
