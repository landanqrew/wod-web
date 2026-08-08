"use client";

import * as React from "react";
import { toast } from "sonner";
import { Card, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FieldRow, Input, Label, Segmented, Select, Toggle } from "@/components/ui/field";
import { Pill } from "@/components/ui/pill";
import { SessionView } from "@/components/session-view";
import { saveSessionAction } from "@/lib/actions/training";
import {
  generateFiveThreeOneWeek,
  generateStrongLiftsDay,
} from "@/lib/domain/frameworks/strength";
import type { FiveThreeOneConfig } from "@/lib/domain/frameworks/strength";
import { getRunPlan, runWorkoutToSession, RUN_PLAN_INFO } from "@/lib/domain/frameworks/running";
import type { RunPlanType } from "@/lib/domain/frameworks/running";
import { generateSplitDay, getSplitDays, SPLIT_INFO } from "@/lib/domain/frameworks/bodybuilding";
import type { SplitType } from "@/lib/domain/frameworks/bodybuilding";
import type { TrainingSession, Workout } from "@/lib/domain/models/workout";
import { cn } from "@/lib/utils";

type Framework = "531" | "stronglifts" | "running" | "bodybuilding";

export function ProgramsClient() {
  const [framework, setFramework] = React.useState<Framework>("531");

  return (
    <>
      <PageHeader
        title="Programs"
        subtitle="Structured frameworks — generate a day, then log it like any other workout."
      />

      <div className="mb-3.5">
        <Segmented
          value={framework}
          onChange={setFramework}
          options={[
            { value: "531", label: "5/3/1" },
            { value: "stronglifts", label: "StrongLifts" },
            { value: "running", label: "Running" },
            { value: "bodybuilding", label: "Splits" },
          ]}
        />
      </div>

      {framework === "531" ? <FiveThreeOne /> : null}
      {framework === "stronglifts" ? <StrongLifts /> : null}
      {framework === "running" ? <Running /> : null}
      {framework === "bodybuilding" ? <Splits /> : null}
    </>
  );
}

/** Shared: persist a generated day as a training session. */
function useSaveSession() {
  const [pending, setPending] = React.useState(false);

  async function save(session: TrainingSession) {
    setPending(true);
    try {
      await saveSessionAction({
        date: new Date().toISOString().slice(0, 10),
        blocks: session.blocks.map((b) => ({
          type: b.type,
          durationMinutes: b.durationMinutes,
          workout: b.workout ? stripped(b.workout) : undefined,
          notes: b.notes,
        })),
        totalDurationMinutes: Math.max(1, session.totalDurationMinutes),
        notes: session.notes,
      });
      toast.success("Saved to your sessions");
    } catch {
      toast.error("Could not save the session");
    } finally {
      setPending(false);
    }
  }

  return { save, pending };
}

function FiveThreeOne() {
  const { save, pending } = useSaveSession();
  const [tm, setTm] = React.useState({ squat: 315, bench: 225, deadlift: 405, press: 145 });
  const [week, setWeek] = React.useState<1 | 2 | 3 | 4>(1);
  const [bbb, setBbb] = React.useState(true);

  const config: FiveThreeOneConfig = { trainingMax: tm, week, includeBBB: bbb };
  const days = generateFiveThreeOneWeek(config);

  return (
    <div className="grid gap-3.5 xl:grid-cols-[340px_1fr] xl:items-start">
      <Card className="flex flex-col gap-4 p-5">
        <div>
          <h2 className="text-[15px] font-bold">Training maxes</h2>
          <p className="text-xs text-subtle">Typically 90% of your true 1RM.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {(["squat", "bench", "deadlift", "press"] as const).map((lift) => (
            <FieldRow key={lift} label={lift === "press" ? "Strict press" : lift}>
              <Input
                type="number"
                className="font-mono"
                value={tm[lift]}
                onChange={(e) => setTm({ ...tm, [lift]: Number(e.target.value) })}
              />
            </FieldRow>
          ))}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Week</Label>
          <Segmented
            value={String(week)}
            onChange={(v) => setWeek(Number(v) as 1 | 2 | 3 | 4)}
            options={[
              { value: "1", label: "5s" },
              { value: "2", label: "3s" },
              { value: "3", label: "5/3/1" },
              { value: "4", label: "Deload" },
            ]}
          />
        </div>
        <Toggle checked={bbb} onChange={setBbb} label="Boring But Big accessory" />
        {week === 4 ? (
          <p className="rounded-lg border border-warn/30 bg-warn/8 px-3 py-2 text-xs text-warn">
            Deload week — no AMRAP sets. Move well, stay fresh.
          </p>
        ) : null}
      </Card>

      <div className="flex flex-col gap-3.5">
        {days.map((session, i) => (
          <SessionView
            key={i}
            session={session}
            title={session.notes ?? `Day ${i + 1}`}
            action={
              <Button size="sm" onClick={() => save(session)} disabled={pending}>
                Save day
              </Button>
            }
          />
        ))}
      </div>
    </div>
  );
}

function StrongLifts() {
  const { save, pending } = useSaveSession();
  const [day, setDay] = React.useState<"A" | "B">("A");
  const [weights, setWeights] = React.useState({
    squat: 225,
    bench: 155,
    row: 135,
    press: 105,
    deadlift: 275,
  });

  const session = generateStrongLiftsDay(day, weights);

  return (
    <div className="grid gap-3.5 xl:grid-cols-[340px_1fr] xl:items-start">
      <Card className="flex flex-col gap-4 p-5">
        <div>
          <h2 className="text-[15px] font-bold">Working weights</h2>
          <p className="text-xs text-subtle">5x5 across. Add 5 lb per session (10 on deadlift).</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {(Object.keys(weights) as (keyof typeof weights)[]).map((lift) => (
            <FieldRow key={lift} label={lift}>
              <Input
                type="number"
                className="font-mono"
                value={weights[lift]}
                onChange={(e) => setWeights({ ...weights, [lift]: Number(e.target.value) })}
              />
            </FieldRow>
          ))}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Day</Label>
          <Segmented
            value={day}
            onChange={setDay}
            options={[
              { value: "A", label: "Day A" },
              { value: "B", label: "Day B" },
            ]}
          />
        </div>
      </Card>

      <SessionView
        session={session}
        title={`StrongLifts — Day ${day}`}
        action={
          <Button size="sm" onClick={() => save(session)} disabled={pending}>
            Save day
          </Button>
        }
      />
    </div>
  );
}

function Running() {
  const { save, pending } = useSaveSession();
  const [plan, setPlan] = React.useState<RunPlanType>("couch_to_5k");
  const [week, setWeek] = React.useState(1);
  const [dayIndex, setDayIndex] = React.useState<number | null>(null);

  const weeks = getRunPlan(plan);
  const current = weeks.find((w) => w.weekNumber === week) ?? weeks[0];
  const day = dayIndex === null ? null : current.days[dayIndex];
  const session = day ? runWorkoutToSession(day, current.weekNumber, dayIndex!) : null;
  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="grid gap-3.5 xl:grid-cols-[340px_1fr] xl:items-start">
      <Card className="flex flex-col gap-4 p-5">
        <FieldRow label="Plan">
          <Select
            value={plan}
            onChange={(e) => {
              setPlan(e.target.value as RunPlanType);
              setWeek(1);
              setDayIndex(null);
            }}
          >
            {(Object.keys(RUN_PLAN_INFO) as RunPlanType[]).map((p) => (
              <option key={p} value={p}>
                {RUN_PLAN_INFO[p].name}
              </option>
            ))}
          </Select>
        </FieldRow>
        <p className="text-xs text-muted-fg">{RUN_PLAN_INFO[plan].description}</p>
        <div className="flex flex-col gap-1.5">
          <Label>Week</Label>
          <div className="flex flex-wrap gap-1.5">
            {weeks.map((w) => (
              <button
                key={w.weekNumber}
                onClick={() => {
                  setWeek(w.weekNumber);
                  setDayIndex(null);
                }}
                className={cn(
                  "h-8 w-8 cursor-pointer rounded-full border font-mono text-[13px] transition",
                  w.weekNumber === week
                    ? "border-primary/50 bg-primary font-semibold text-on-primary"
                    : "border-border-hi text-muted-fg hover:bg-muted hover:text-ink"
                )}
              >
                {w.weekNumber}
              </button>
            ))}
          </div>
        </div>
        <p className="font-mono text-xs text-subtle">
          {current.totalDistanceKm} km scheduled this week
        </p>
      </Card>

      <div className="flex flex-col gap-3.5">
        <Card className="p-5">
          <h3 className="mb-3 text-[15px] font-bold">Week {current.weekNumber}</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {current.days.map((d, i) => (
              <button
                key={i}
                onClick={() => setDayIndex(i)}
                className={cn(
                  "flex cursor-pointer flex-col gap-1 rounded-xl border px-3.5 py-2.5 text-left transition",
                  i === dayIndex
                    ? "border-primary/50 bg-primary/8"
                    : "border-border bg-app hover:border-border-hi"
                )}
              >
                <span className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-subtle">{dayNames[i]}</span>
                  <Pill tone={d.type === "rest" ? "neutral" : "format"}>{d.type}</Pill>
                </span>
                <span className="text-[13px]">{d.description}</span>
                {d.durationMinutes ? (
                  <span className="font-mono text-[11px] text-subtle">
                    {d.durationMinutes} min
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </Card>

        {session ? (
          <SessionView
            session={session}
            title={session.notes ?? "Run"}
            action={
              <Button size="sm" onClick={() => save(session)} disabled={pending}>
                Save day
              </Button>
            }
          />
        ) : null}
      </div>
    </div>
  );
}

function Splits() {
  const { save, pending } = useSaveSession();
  const [split, setSplit] = React.useState<SplitType>("ppl");
  const [dayIndex, setDayIndex] = React.useState(0);

  const days = getSplitDays(split);
  const session = generateSplitDay(split, dayIndex);

  return (
    <div className="grid gap-3.5 xl:grid-cols-[340px_1fr] xl:items-start">
      <Card className="flex flex-col gap-4 p-5">
        <FieldRow label="Split">
          <Select
            value={split}
            onChange={(e) => {
              setSplit(e.target.value as SplitType);
              setDayIndex(0);
            }}
          >
            {(Object.keys(SPLIT_INFO) as SplitType[]).map((s) => (
              <option key={s} value={s}>
                {SPLIT_INFO[s].name}
              </option>
            ))}
          </Select>
        </FieldRow>
        <p className="text-xs text-muted-fg">{SPLIT_INFO[split].description}</p>
        <div className="flex flex-col gap-1.5">
          <Label>Day</Label>
          <div className="flex flex-col gap-1.5">
            {days.map((d, i) => (
              <button
                key={d.name}
                onClick={() => setDayIndex(i)}
                className={cn(
                  "flex cursor-pointer flex-col rounded-xl border px-3.5 py-2 text-left transition",
                  i === dayIndex
                    ? "border-primary/50 bg-primary/8"
                    : "border-border bg-app hover:border-border-hi"
                )}
              >
                <b className="text-[13px] font-medium">{d.name}</b>
                <small className="text-[11px] text-subtle">{d.focus}</small>
              </button>
            ))}
          </div>
        </div>
      </Card>

      <SessionView
        session={session}
        title={session.notes ?? days[dayIndex]?.name}
        action={
          <Button size="sm" onClick={() => save(session)} disabled={pending}>
            Save day
          </Button>
        }
      />
    </div>
  );
}

function stripped(workout: Workout): Workout {
  return {
    ...workout,
    movements: workout.movements.map(({ movement: _movement, ...rest }) => rest),
  };
}
