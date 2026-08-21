"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import {
  ChipToggle,
  FieldRow,
  Input,
  Select,
  Textarea,
} from "@/components/ui/field";
import {
  cancelClassSessionAction,
  createClassAction,
  updateClassAction,
} from "@/lib/actions/gym-class";
import {
  cancelReservationAction,
  reserveClassSessionAction,
} from "@/lib/actions/reservation";
import {
  generateGymDayAction,
  programGymDayAction,
  updateSessionProgrammedWorkoutAction,
} from "@/lib/actions/programmed-workout";
import { overrideAssignedWorkoutAction } from "@/lib/actions/assigned-workout";
import { promoteLoadAdjustmentAction } from "@/lib/actions/load-adjustment";
import { MembershipRole, type Gym, type GymMember } from "@/lib/domain/models/gym";
import type { AssignedWorkout } from "@/lib/domain/models/assigned-workout";
import type { ClassSessionSummary, GymClass } from "@/lib/domain/models/gym-class";
import {
  ScoreType,
  WorkoutFormat,
  type MovementPrescription,
  type Workout,
} from "@/lib/domain/models/workout";
import {
  changeProgrammedWorkoutFormat,
  createManualProgrammedWorkout,
} from "@/lib/domain/programming/manual-workout";
import type { WeeklyClassTime } from "@/lib/domain/scheduling/expand-class-schedule";
import { formatLabel, prescriptionLine } from "@/lib/format";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Draft = {
  id?: string;
  gymId: string;
  name: string;
  coachAthleteId: string;
  weeklyTimes: WeeklyClassTime[];
  timeZone: string;
  capacity: number;
};

type ProgrammingDraft = {
  gymId: string;
  sessionId?: string;
  localDate: string;
  workout: Workout;
  movementsJson: string;
};

type ProgrammingNumberField =
  | "timeCap"
  | "rounds"
  | "workInterval"
  | "restInterval"
  | "emomMinutes";

type OverrideDraft = {
  sessionId: string;
  movementIndex: number;
  movementId: string;
  reps: string;
  load: string;
  duration: string;
  initial: {
    movementId: string;
    reps: string;
    load: string;
    duration: string;
  };
};

type PromotionPrompt = {
  sessionId: string;
  movementIndex: number;
  movementName: string;
  percent: number;
};

export function ClassesClient({
  gyms,
  upcomingSessions,
  programmedWorkoutsBySession,
  assignedWorkoutsBySession,
  classesByGym,
  coachesByGym,
  movementOptionsBySession,
}: {
  gyms: Gym[];
  upcomingSessions: ClassSessionSummary[];
  programmedWorkoutsBySession: Record<string, Workout | undefined>;
  assignedWorkoutsBySession: Record<string, AssignedWorkout | null>;
  classesByGym: Record<string, GymClass[]>;
  coachesByGym: Record<string, GymMember[]>;
  movementOptionsBySession: Record<
    string,
    Array<{ id: string; name: string; loadType: string; available: boolean }>
  >;
}) {
  const router = useRouter();
  const ownerGyms = gyms.filter(
    ({ membershipRole }) => membershipRole === MembershipRole.Owner,
  );
  const [selectedGymId, setSelectedGymId] = React.useState(gyms[0]?.id ?? "");
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [programmingDraft, setProgrammingDraft] =
    React.useState<ProgrammingDraft | null>(null);
  const [programmingDate, setProgrammingDate] = React.useState("");
  const [overrideDraft, setOverrideDraft] = React.useState<OverrideDraft | null>(
    null,
  );
  const [promotionPrompt, setPromotionPrompt] =
    React.useState<PromotionPrompt | null>(null);
  const [pending, startTransition] = React.useTransition();
  const selectedGym = gyms.find(({ id }) => id === selectedGymId) ?? gyms[0];

  function beginCreate() {
    const gym =
      ownerGyms.find(({ id }) => id === selectedGym?.id) ?? ownerGyms[0];
    if (!gym) return;
    const coach = coachesByGym[gym.id]?.[0];
    setDraft({
      gymId: gym.id,
      name: "",
      coachAthleteId: coach?.athleteId ?? "",
      weeklyTimes: [{ dayOfWeek: 1, localTime: "06:00" }],
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      capacity: 20,
    });
  }

  function beginEdit(gymClass: GymClass) {
    setDraft({
      id: gymClass.id,
      gymId: gymClass.gymId,
      name: gymClass.name,
      coachAthleteId: gymClass.coachAthleteId ?? "",
      weeklyTimes: gymClass.weeklyTimes,
      timeZone: gymClass.timeZone,
      capacity: gymClass.capacity,
    });
  }

  function save() {
    if (!draft) return;
    startTransition(async () => {
      try {
        if (draft.id) await updateClassAction(draft.id, draft);
        else await createClassAction(draft.gymId, draft);
        toast.success(draft.id ? "Class schedule updated" : "Class created");
        setSelectedGymId(draft.gymId);
        setDraft(null);
        router.refresh();
      } catch {
        toast.error("Could not save the Class definition.");
      }
    });
  }

  function cancelSession(classSessionId: string) {
    startTransition(async () => {
      try {
        await cancelClassSessionAction(classSessionId);
        toast.success("Class Session cancelled");
        router.refresh();
      } catch {
        toast.error("Could not cancel that Class Session.");
      }
    });
  }

  function toggleReservation(session: ClassSessionSummary) {
    startTransition(async () => {
      try {
        if (session.reserved) {
          let discardAssignedWorkout = false;
          if (assignedWorkoutsBySession[session.id]) {
            discardAssignedWorkout = window.confirm(
              "Cancelling removes your Assigned Workout and any personal edits. Continue?",
            );
            if (!discardAssignedWorkout) return;
          }
          let result = await cancelReservationAction(
            session.id,
            discardAssignedWorkout,
          );
          if (!result.cancelled) {
            discardAssignedWorkout = window.confirm(
              "A new Assigned Workout is now attached. Cancelling removes it and any personal edits. Continue?",
            );
            if (!discardAssignedWorkout) return;
            result = await cancelReservationAction(session.id, true);
          }
          if (!result.cancelled) throw new Error("Cancellation was not confirmed");
        } else await reserveClassSessionAction(session.id);
        toast.success(session.reserved ? "Reservation cancelled" : "Spot reserved");
        router.refresh();
      } catch {
        toast.error("Could not update that Reservation. The Class may be full.");
      }
    });
  }

  function beginManualProgramming(localDate: string) {
    if (!selectedGym) return;
    const workout = createManualProgrammedWorkout();
    setProgrammingDraft({
      gymId: selectedGym.id,
      localDate,
      workout,
      movementsJson: JSON.stringify(workout.movements, null, 2),
    });
  }

  function beginProgrammedWorkoutEdit(session: ClassSessionSummary) {
    const workout = programmedWorkoutsBySession[session.id];
    if (!workout) return;
    setProgrammingDraft({
      gymId: session.gymId,
      sessionId: session.id,
      localDate: session.localDate,
      workout,
      movementsJson: JSON.stringify(
        workout.movements.map(({ movement: _movement, ...prescription }) =>
          prescription,
        ),
        null,
        2,
      ),
    });
  }

  function saveProgrammedWorkout() {
    if (!programmingDraft) return;
    startTransition(async () => {
      try {
        const movements = JSON.parse(
          programmingDraft.movementsJson,
        ) as MovementPrescription[];
        const workout = { ...programmingDraft.workout, movements };
        if (programmingDraft.sessionId) {
          await updateSessionProgrammedWorkoutAction(
            programmingDraft.sessionId,
            workout,
          );
        } else {
          await programGymDayAction(
            programmingDraft.gymId,
            programmingDraft.localDate,
            workout,
          );
        }
        toast.success(
          programmingDraft.sessionId
            ? "Class Session workout updated"
            : "Workout programmed for the gym-day",
        );
        setProgrammingDraft(null);
        router.refresh();
      } catch {
        toast.error("Could not save that Programmed Workout. Check the prescription.");
      }
    });
  }

  function updateProgrammingNumber(
    field: ProgrammingNumberField,
    value: number,
  ) {
    if (!programmingDraft) return;
    setProgrammingDraft({
      ...programmingDraft,
      workout: { ...programmingDraft.workout, [field]: value },
    });
  }

  function generateGymDay(localDate: string) {
    if (!selectedGym) return;
    startTransition(async () => {
      try {
        await generateGymDayAction(selectedGym.id, localDate, {
          format: WorkoutFormat.AMRAP,
          movementCount: 3,
        });
        toast.success("Gym-floor workout programmed for the day");
        router.refresh();
      } catch {
        toast.error("Could not generate a Programmed Workout for that day.");
      }
    });
  }

  function beginOverride(
    sessionId: string,
    movementIndex: number,
    prescription: MovementPrescription,
  ) {
    const initial = {
      movementId: prescription.movementId,
      reps: prescription.reps?.toString() ?? "",
      load: prescription.load?.toString() ?? "",
      duration: prescription.duration?.toString() ?? "",
    };
    setOverrideDraft({
      sessionId,
      movementIndex,
      ...initial,
      initial,
    });
  }

  function saveOverride() {
    if (!overrideDraft) return;
    startTransition(async () => {
      try {
        const changedNumber = (
          field: "reps" | "load" | "duration",
        ) =>
          overrideDraft[field] === "" ||
          overrideDraft[field] === overrideDraft.initial[field]
            ? undefined
            : Number(overrideDraft[field]);
        const result = await overrideAssignedWorkoutAction(overrideDraft.sessionId, {
          movementIndex: overrideDraft.movementIndex,
          movementId:
            overrideDraft.movementId === overrideDraft.initial.movementId
              ? undefined
              : overrideDraft.movementId,
          reps: changedNumber("reps"),
          load: changedNumber("load"),
          duration: changedNumber("duration"),
        });
        if (result.loadAdjustmentOffer) {
          setPromotionPrompt({
            sessionId: overrideDraft.sessionId,
            movementIndex: overrideDraft.movementIndex,
            movementName: result.loadAdjustmentOffer.movementName,
            percent: result.loadAdjustmentOffer.percent,
          });
        } else setPromotionPrompt(null);
        toast.success("Assigned Workout updated");
        setOverrideDraft(null);
        router.refresh();
      } catch {
        toast.error("Could not apply that override. Check the Movement and Gym floor.");
      }
    });
  }

  function answerPromotion(reason: "capability" | "injury") {
    if (!promotionPrompt) return;
    startTransition(async () => {
      try {
        const result = await promoteLoadAdjustmentAction({
          classSessionId: promotionPrompt.sessionId,
          movementIndex: promotionPrompt.movementIndex,
          reason,
          reviewAfterSessions: 5,
        });
        if (result.status === "impediment_required") {
          toast.info(
            "Record a dated Impediment so the injury restriction can expire.",
          );
          setPromotionPrompt(null);
          router.push("/adjustments?newImpediment=1");
          return;
        } else {
          toast.success("Load Adjustment will apply to future programmed loads");
        }
        setPromotionPrompt(null);
        router.refresh();
      } catch {
        toast.error("Could not create that Load Adjustment.");
      }
    });
  }

  function supportsOverrideField(field: "reps" | "load" | "duration") {
    if (!overrideDraft) return false;
    const loadType = movementOptionsBySession[overrideDraft.sessionId]?.find(
      ({ id }) => id === overrideDraft.movementId,
    )?.loadType;
    if (field === "reps") {
      return loadType === "weighted" || loadType === "bodyweight";
    }
    return loadType === field;
  }

  function toggleDay(dayOfWeek: number) {
    if (!draft) return;
    const existing = draft.weeklyTimes.some((time) => time.dayOfWeek === dayOfWeek);
    setDraft({
      ...draft,
      weeklyTimes: existing
        ? draft.weeklyTimes.filter((time) => time.dayOfWeek !== dayOfWeek)
        : [...draft.weeklyTimes, { dayOfWeek, localTime: "06:00" }],
    });
  }

  const selectedClasses = selectedGym ? classesByGym[selectedGym.id] ?? [] : [];
  const selectedSessions = selectedGym
    ? upcomingSessions.filter(({ gymId }) => gymId === selectedGym.id)
    : [];
  const selectedDates = [...new Set(selectedSessions.map(({ localDate }) => localDate))];
  const effectiveProgrammingDate = selectedDates.includes(programmingDate)
    ? programmingDate
    : selectedDates[0] ?? "";
  const canProgram =
    selectedGym?.membershipRole === MembershipRole.Owner ||
    selectedGym?.membershipRole === MembershipRole.Coach;

  return (
    <>
      <PageHeader
        title="Classes"
        subtitle={selectedGym ? `Viewing ${selectedGym.name}` : "Upcoming Class Sessions"}
        action={
          ownerGyms.length > 0 ? <Button onClick={beginCreate}>Create Class</Button> : null
        }
      />

      {gyms.length > 1 ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {gyms.map((gym) => (
            <ChipToggle
              key={gym.id}
              active={gym.id === selectedGym?.id}
              onClick={() => setSelectedGymId(gym.id)}
            >
              {gym.name}
            </ChipToggle>
          ))}
        </div>
      ) : null}

      {draft ? (
        <Card className="mb-4 flex flex-col gap-4 p-5">
          {!draft.id ? (
            <FieldRow label="Gym">
              <Select
                value={draft.gymId}
                onChange={(event) => {
                  const gymId = event.target.value;
                  setDraft({
                    ...draft,
                    gymId,
                    coachAthleteId: coachesByGym[gymId]?.[0]?.athleteId ?? "",
                  });
                }}
              >
                {ownerGyms.map((gym) => (
                  <option key={gym.id} value={gym.id}>{gym.name}</option>
                ))}
              </Select>
            </FieldRow>
          ) : null}
          <div className="grid gap-3 md:grid-cols-2">
            <FieldRow label="Class name">
              <Input
                value={draft.name}
                maxLength={120}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
            </FieldRow>
            <FieldRow label="Coach">
              <Select
                value={draft.coachAthleteId}
                onChange={(event) =>
                  setDraft({ ...draft, coachAthleteId: event.target.value })
                }
              >
                {(coachesByGym[draft.gymId] ?? []).map((coach) => (
                  <option key={coach.athleteId} value={coach.athleteId}>
                    {coach.name} · {coach.role}
                  </option>
                ))}
              </Select>
            </FieldRow>
            <FieldRow label="Time zone">
              <Input
                value={draft.timeZone}
                onChange={(event) => setDraft({ ...draft, timeZone: event.target.value })}
              />
            </FieldRow>
            <FieldRow label="Capacity">
              <Input
                type="number"
                min={1}
                value={draft.capacity}
                onChange={(event) =>
                  setDraft({ ...draft, capacity: Number(event.target.value) })
                }
              />
            </FieldRow>
          </div>
          <FieldRow label="Weekly days">
            <div className="flex flex-wrap gap-1.5">
              {DAYS.map((day, dayOfWeek) => (
                <ChipToggle
                  key={day}
                  active={draft.weeklyTimes.some((time) => time.dayOfWeek === dayOfWeek)}
                  onClick={() => toggleDay(dayOfWeek)}
                >
                  {day}
                </ChipToggle>
              ))}
            </div>
          </FieldRow>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[...draft.weeklyTimes]
              .sort((left, right) => left.dayOfWeek - right.dayOfWeek)
              .map((weeklyTime) => (
                <FieldRow key={weeklyTime.dayOfWeek} label={DAYS[weeklyTime.dayOfWeek]}>
                  <Input
                    type="time"
                    value={weeklyTime.localTime}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        weeklyTimes: draft.weeklyTimes.map((time) =>
                          time.dayOfWeek === weeklyTime.dayOfWeek
                            ? { ...time, localTime: event.target.value }
                            : time,
                        ),
                      })
                    }
                  />
                </FieldRow>
              ))}
          </div>
          <div className="flex gap-2">
            <Button variant="primary" disabled={pending} onClick={save}>Save Class</Button>
            <Button disabled={pending} onClick={() => setDraft(null)}>Cancel</Button>
          </div>
        </Card>
      ) : null}

      {canProgram && effectiveProgrammingDate ? (
        <Card className="mb-4 flex flex-col gap-3 p-5">
          <div>
            <h2 className="text-lg font-bold">Programme a gym-day</h2>
            <p className="text-xs text-subtle">
              One save publishes an independent copy to every Class Session that day.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <FieldRow label="Class date" className="min-w-44">
              <Select
                value={effectiveProgrammingDate}
                onChange={(event) => setProgrammingDate(event.target.value)}
              >
                {selectedDates.map((localDate) => (
                  <option key={localDate} value={localDate}>{localDate}</option>
                ))}
              </Select>
            </FieldRow>
            <Button
              variant="primary"
              disabled={pending}
              onClick={() => generateGymDay(effectiveProgrammingDate)}
            >
              Generate from floor
            </Button>
            <Button
              disabled={pending}
              onClick={() => beginManualProgramming(effectiveProgrammingDate)}
            >
              Write by hand
            </Button>
          </div>
        </Card>
      ) : null}

      {programmingDraft ? (
        <Card className="mb-4 flex flex-col gap-4 p-5">
          <div>
            <h2 className="text-lg font-bold">
              {programmingDraft.sessionId
                ? "Edit this Class Session"
                : `Write ${programmingDraft.localDate} by hand`}
            </h2>
            <p className="text-xs text-subtle">
              Weighted movements use <code>rxLoad</code> with male and female values.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <FieldRow label="Workout name">
              <Input
                value={programmingDraft.workout.name}
                onChange={(event) =>
                  setProgrammingDraft({
                    ...programmingDraft,
                    workout: {
                      ...programmingDraft.workout,
                      name: event.target.value,
                    },
                  })
                }
              />
            </FieldRow>
            <FieldRow label="Format">
              <Select
                value={programmingDraft.workout.format}
                onChange={(event) =>
                  setProgrammingDraft({
                    ...programmingDraft,
                    workout: changeProgrammedWorkoutFormat(
                      programmingDraft.workout,
                      event.target.value as WorkoutFormat,
                    ),
                  })
                }
              >
                {Object.values(WorkoutFormat).map((format) => (
                  <option key={format} value={format}>{formatLabel(format)}</option>
                ))}
              </Select>
            </FieldRow>
            <FieldRow label="Score type">
              <Select
                value={programmingDraft.workout.scoreType}
                onChange={(event) =>
                  setProgrammingDraft({
                    ...programmingDraft,
                    workout: {
                      ...programmingDraft.workout,
                      scoreType: event.target.value as ScoreType,
                    },
                  })
                }
              >
                {Object.values(ScoreType).map((scoreType) => (
                  <option key={scoreType} value={scoreType}>{formatLabel(scoreType)}</option>
                ))}
              </Select>
            </FieldRow>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {programmingDraft.workout.timeCap !== undefined ? (
              <FieldRow label="Time cap (minutes)">
                <Input
                  type="number"
                  min={1}
                  value={programmingDraft.workout.timeCap}
                  onChange={(event) =>
                    updateProgrammingNumber("timeCap", Number(event.target.value))
                  }
                />
              </FieldRow>
            ) : null}
            {programmingDraft.workout.rounds !== undefined ? (
              <FieldRow label="Rounds / sets">
                <Input
                  type="number"
                  min={1}
                  value={programmingDraft.workout.rounds}
                  onChange={(event) =>
                    updateProgrammingNumber("rounds", Number(event.target.value))
                  }
                />
              </FieldRow>
            ) : null}
            {programmingDraft.workout.emomMinutes !== undefined ? (
              <FieldRow label="EMOM minutes">
                <Input
                  type="number"
                  min={1}
                  value={programmingDraft.workout.emomMinutes}
                  onChange={(event) =>
                    updateProgrammingNumber(
                      "emomMinutes",
                      Number(event.target.value),
                    )
                  }
                />
              </FieldRow>
            ) : null}
            {programmingDraft.workout.workInterval !== undefined ? (
              <FieldRow label="Work seconds">
                <Input
                  type="number"
                  min={1}
                  value={programmingDraft.workout.workInterval}
                  onChange={(event) =>
                    updateProgrammingNumber(
                      "workInterval",
                      Number(event.target.value),
                    )
                  }
                />
              </FieldRow>
            ) : null}
            {programmingDraft.workout.restInterval !== undefined ? (
              <FieldRow label="Rest seconds">
                <Input
                  type="number"
                  min={0}
                  value={programmingDraft.workout.restInterval}
                  onChange={(event) =>
                    updateProgrammingNumber(
                      "restInterval",
                      Number(event.target.value),
                    )
                  }
                />
              </FieldRow>
            ) : null}
          </div>
          <FieldRow
            label="Movement prescriptions (JSON)"
            hint='Example: [{"movementId":"thruster","reps":15,"rxLoad":{"male":95,"female":65}}]'
          >
            <Textarea
              className="min-h-40 font-mono text-sm"
              value={programmingDraft.movementsJson}
              onChange={(event) =>
                setProgrammingDraft({
                  ...programmingDraft,
                  movementsJson: event.target.value,
                })
              }
            />
          </FieldRow>
          <div className="flex gap-2">
            <Button variant="primary" disabled={pending} onClick={saveProgrammedWorkout}>
              {programmingDraft.sessionId ? "Save this Session" : "Publish gym-day"}
            </Button>
            <Button disabled={pending} onClick={() => setProgrammingDraft(null)}>
              Cancel
            </Button>
          </div>
        </Card>
      ) : null}

      {selectedGym?.membershipRole === MembershipRole.Owner && selectedClasses.length > 0 ? (
        <Card className="mb-4 flex flex-col gap-3 p-5">
          <h2 className="text-lg font-bold">Class definitions</h2>
          {selectedClasses.map((gymClass) => (
            <div key={gymClass.id} className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{gymClass.name}</p>
                <p className="text-xs text-subtle">
                  {gymClass.coachName ?? "Coach unassigned"} · {gymClass.capacity} capacity
                </p>
              </div>
              <Button size="sm" onClick={() => beginEdit(gymClass)}>Edit schedule</Button>
            </div>
          ))}
        </Card>
      ) : null}

      {selectedSessions.length === 0 ? (
        <Card>
          <EmptyState
            title="No upcoming Class Sessions"
            hint="Class definitions automatically expand into dated sessions."
          />
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {selectedSessions.map((session) => (
            <Card key={session.id} className="flex flex-col gap-3 p-5">
              <div>
                <h2 className="font-bold">{session.className}</h2>
                <p className="text-xs text-subtle">{session.gymName}</p>
              </div>
              <p className="text-sm">
                {new Intl.DateTimeFormat("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                  timeZone: session.timeZone,
                  timeZoneName: "short",
                }).format(new Date(session.startsAt))}
              </p>
              <p className="text-xs text-subtle">
                Coach {session.coachName ?? "TBD"} · capacity {session.capacity}
              </p>
              {programmedWorkoutsBySession[session.id] ? (
                <div className="rounded-xl border border-border bg-app p-3">
                  <p className="text-sm font-semibold">
                    {programmedWorkoutsBySession[session.id]?.name}
                  </p>
                  <p className="mt-1 text-xs text-subtle">
                    {programmedWorkoutsBySession[session.id]?.movements
                      .map(prescriptionLine)
                      .join(" · ")}
                  </p>
                </div>
              ) : null}
              {assignedWorkoutsBySession[session.id] ? (
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
                  <p className="text-sm font-semibold">Your Assigned Workout</p>
                  <div className="mt-2 space-y-2">
                    {assignedWorkoutsBySession[session.id]?.workout.movements.map(
                      (prescription, movementIndex) => (
                        <div
                          key={`${movementIndex}-${prescription.movementId}`}
                          className="flex items-center justify-between gap-2 text-xs"
                        >
                          <span className="text-subtle">
                            {prescriptionLine(prescription)}
                          </span>
                          <Button
                            size="sm"
                            disabled={pending}
                            onClick={() =>
                              beginOverride(session.id, movementIndex, prescription)
                            }
                          >
                            Edit
                          </Button>
                        </div>
                      ),
                    )}
                  </div>
                  {(assignedWorkoutsBySession[session.id]?.changes.length ?? 0) > 0 ? (
                    <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-subtle">
                      {assignedWorkoutsBySession[session.id]?.changes.map((change) => (
                        <li key={`${change.movementIndex}-${change.personalisedMovementId}`}>
                          {change.explanations.join(" · ")}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs text-subtle">
                      Matches the programmed version after Rx resolution.
                    </p>
                  )}
                </div>
              ) : null}
              {overrideDraft?.sessionId === session.id ? (
                <div className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-2">
                  <FieldRow label="Movement">
                    <Select
                      value={overrideDraft.movementId}
                      onChange={(event) =>
                        setOverrideDraft({
                          ...overrideDraft,
                          movementId: event.target.value,
                          reps: "",
                          load: "",
                          duration: "",
                        })
                      }
                    >
                      {(movementOptionsBySession[session.id] ?? []).map((movement) => (
                        <option
                          key={movement.id}
                          value={movement.id}
                          disabled={!movement.available}
                        >
                          {movement.name}
                          {movement.available ? "" : " (unavailable)"}
                        </option>
                      ))}
                    </Select>
                  </FieldRow>
                  {(["reps", "load", "duration"] as const)
                    .filter(supportsOverrideField)
                    .map((field) => (
                    <FieldRow key={field} label={formatLabel(field)}>
                      <Input
                        type="number"
                        min={0}
                        value={overrideDraft[field]}
                        onChange={(event) =>
                          setOverrideDraft({
                            ...overrideDraft,
                            [field]: event.target.value,
                          })
                        }
                      />
                    </FieldRow>
                    ))}
                  <div className="flex gap-2 sm:col-span-2">
                    <Button variant="primary" disabled={pending} onClick={saveOverride}>
                      Apply override
                    </Button>
                    <Button disabled={pending} onClick={() => setOverrideDraft(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : null}
              {promotionPrompt?.sessionId === session.id ? (
                <div className="rounded-xl border border-primary/30 bg-primary/10 p-3 text-sm">
                  <p className="font-semibold">
                    Keep {promotionPrompt.movementName} at {promotionPrompt.percent}% for future workouts?
                  </p>
                  <p className="mt-1 text-xs text-subtle">
                    The ratio follows each Coach-programmed load and never changes reps.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={pending}
                      onClick={() => answerPromotion("capability")}
                    >
                      Keep for future
                    </Button>
                    <Button
                      size="sm"
                      disabled={pending}
                      onClick={() => answerPromotion("injury")}
                    >
                      This is pain or injury
                    </Button>
                    <Button
                      size="sm"
                      disabled={pending}
                      onClick={() => setPromotionPrompt(null)}
                    >
                      Just today
                    </Button>
                  </div>
                </div>
              ) : null}
              <p className="text-xs text-subtle">
                {session.workoutPosted ? "Workout posted" : "Workout not posted yet"}
                {selectedGym?.membershipRole !== MembershipRole.Member
                  ? ` · ${session.reservationCount} reserved`
                  : ""}
              </p>
              <Button
                size="sm"
                variant={session.reserved ? "danger" : "primary"}
                disabled={
                  pending ||
                  (!session.reserved && session.reservationCount >= session.capacity)
                }
                onClick={() => toggleReservation(session)}
              >
                {session.reserved
                  ? "Cancel Reservation"
                  : session.reservationCount >= session.capacity
                    ? "Class full"
                    : "Reserve spot"}
              </Button>
              {selectedGym?.membershipRole === MembershipRole.Owner ? (
                <Button
                  size="sm"
                  variant="danger"
                  disabled={pending}
                  onClick={() => cancelSession(session.id)}
                >
                  Cancel Session
                </Button>
              ) : null}
              {canProgram && programmedWorkoutsBySession[session.id] ? (
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() => beginProgrammedWorkoutEdit(session)}
                >
                  Edit this Session workout
                </Button>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
