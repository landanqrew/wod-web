"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { ChipToggle, FieldRow, Input, Select } from "@/components/ui/field";
import {
  cancelClassSessionAction,
  createClassAction,
  updateClassAction,
} from "@/lib/actions/gym-class";
import {
  cancelReservationAction,
  reserveClassSessionAction,
} from "@/lib/actions/reservation";
import { MembershipRole, type Gym, type GymMember } from "@/lib/domain/models/gym";
import type { ClassSessionSummary, GymClass } from "@/lib/domain/models/gym-class";
import type { WeeklyClassTime } from "@/lib/domain/scheduling/expand-class-schedule";

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

export function ClassesClient({
  gyms,
  upcomingSessions,
  classesByGym,
  coachesByGym,
}: {
  gyms: Gym[];
  upcomingSessions: ClassSessionSummary[];
  classesByGym: Record<string, GymClass[]>;
  coachesByGym: Record<string, GymMember[]>;
}) {
  const router = useRouter();
  const ownerGyms = gyms.filter(
    ({ membershipRole }) => membershipRole === MembershipRole.Owner,
  );
  const [selectedGymId, setSelectedGymId] = React.useState(gyms[0]?.id ?? "");
  const [draft, setDraft] = React.useState<Draft | null>(null);
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
        if (session.reserved) await cancelReservationAction(session.id);
        else await reserveClassSessionAction(session.id);
        toast.success(session.reserved ? "Reservation cancelled" : "Spot reserved");
        router.refresh();
      } catch {
        toast.error("Could not update that Reservation. The Class may be full.");
      }
    });
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
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
