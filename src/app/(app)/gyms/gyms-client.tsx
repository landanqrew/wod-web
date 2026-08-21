"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChipToggle, FieldRow, Input, Select } from "@/components/ui/field";
import {
  createGymAction,
  grantGymMembershipAction,
  revokeGymMembershipAction,
  updateGymAction,
} from "@/lib/actions/gym";
import { Equipment } from "@/lib/domain/models/equipment";
import {
  MembershipRole,
  type Gym,
  type GymFloorEntry,
  type GymMember,
} from "@/lib/domain/models/gym";
import { titleCase } from "@/lib/format";

const EQUIPMENT = Object.values(Equipment).filter(
  (equipment) => equipment !== Equipment.None,
);

type Draft = {
  id?: string;
  name: string;
  recoveryWindowHours: number;
  floor: GymFloorEntry[];
};

export function GymsClient({
  gyms,
  memberships,
}: {
  gyms: Gym[];
  memberships: Record<string, GymMember[]>;
}) {
  const router = useRouter();
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [selectedGymId, setSelectedGymId] = React.useState(gyms[0]?.id);
  const [memberEmail, setMemberEmail] = React.useState("");
  const [memberRole, setMemberRole] = React.useState<MembershipRole>(
    MembershipRole.Coach,
  );
  const [pending, startTransition] = React.useTransition();
  const selectedGym = gyms.find(({ id }) => id === selectedGymId) ?? gyms[0];

  function edit(gym?: Gym) {
    setDraft(
      gym
        ? {
            id: gym.id,
            name: gym.name,
            recoveryWindowHours: gym.recoveryWindowHours,
            floor: gym.floor,
          }
        : { name: "", recoveryWindowHours: 48, floor: [] },
    );
  }

  function toggle(equipment: Equipment) {
    if (!draft) return;
    const exists = draft.floor.some((entry) => entry.equipment === equipment);
    setDraft({
      ...draft,
      floor: exists
        ? draft.floor.filter((entry) => entry.equipment !== equipment)
        : [...draft.floor, { equipment }],
    });
  }

  function setStations(equipment: Equipment, value: string) {
    if (!draft) return;
    setDraft({
      ...draft,
      floor: draft.floor.map((entry) =>
        entry.equipment === equipment
          ? {
              equipment,
              ...(value ? { stationCount: Number(value) } : {}),
            }
          : entry,
      ),
    });
  }

  function save() {
    if (!draft) return;
    startTransition(async () => {
      try {
        const input = {
          name: draft.name,
          recoveryWindowHours: draft.recoveryWindowHours,
          floor: draft.floor,
        };
        if (draft.id) await updateGymAction(draft.id, input);
        else await createGymAction(input);
        toast.success(draft.id ? "Gym floor updated" : "Gym created");
        setDraft(null);
        router.refresh();
      } catch {
        toast.error("Could not save the Gym. Check its name and Station counts.");
      }
    });
  }

  function grantMembership() {
    if (!selectedGym) return;
    startTransition(async () => {
      try {
        await grantGymMembershipAction(selectedGym.id, {
          email: memberEmail,
          role: memberRole,
        });
        toast.success("Membership granted");
        setMemberEmail("");
        router.refresh();
      } catch {
        toast.error("Could not find that Athlete or grant the Membership.");
      }
    });
  }

  function revokeMembership(athleteId: string) {
    if (!selectedGym) return;
    startTransition(async () => {
      try {
        await revokeGymMembershipAction(selectedGym.id, athleteId);
        toast.success("Membership revoked");
        router.refresh();
      } catch {
        toast.error("Could not revoke that Membership.");
      }
    });
  }

  return (
    <>
      <PageHeader
        title="Gyms"
        subtitle={
          selectedGym
            ? `Viewing ${selectedGym.name} as ${titleCase(selectedGym.membershipRole)}`
            : "Declare the equipment available on each Gym floor."
        }
        action={<Button onClick={() => edit()}>Create Gym</Button>}
      />

      {draft ? (
        <Card className="mb-4 flex flex-col gap-4 p-5">
          <FieldRow label="Gym name">
            <Input
              value={draft.name}
              maxLength={120}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </FieldRow>
          <FieldRow
            label="Strength recovery window (hours)"
            hint="Used for programming guidance; 0 disables the window"
          >
            <Input
              type="number"
              min={0}
              max={720}
              value={draft.recoveryWindowHours}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  recoveryWindowHours: Number(event.target.value),
                })
              }
            />
          </FieldRow>
          <div className="flex flex-wrap gap-1.5">
            {EQUIPMENT.map((equipment) => (
              <ChipToggle
                key={equipment}
                active={draft.floor.some((entry) => entry.equipment === equipment)}
                onClick={() => toggle(equipment)}
              >
                {titleCase(equipment)}
              </ChipToggle>
            ))}
          </div>
          {draft.floor.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {draft.floor.map((entry) => (
                <FieldRow
                  key={entry.equipment}
                  label={titleCase(entry.equipment)}
                  hint="Optional; blank means enough Stations"
                >
                  <Input
                    type="number"
                    min={1}
                    placeholder="Station count"
                    value={entry.stationCount ?? ""}
                    onChange={(event) =>
                      setStations(entry.equipment, event.target.value)
                    }
                  />
                </FieldRow>
              ))}
            </div>
          ) : null}
          <div className="flex gap-2">
            <Button variant="primary" disabled={pending} onClick={save}>
              {pending ? "Saving…" : "Save Gym"}
            </Button>
            <Button disabled={pending} onClick={() => setDraft(null)}>
              Cancel
            </Button>
          </div>
        </Card>
      ) : null}

      {gyms.length === 0 ? (
        <Card>
          <EmptyState
            title="No Gyms yet"
            hint="Create a Gym to declare the equipment available on its floor."
            action={<Button onClick={() => edit()}>Create Gym</Button>}
          />
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {gyms.map((gym) => (
            <Card
              key={gym.id}
              className={`flex flex-col gap-3 p-5 ${
                gym.id === selectedGym?.id ? "border-primary/50" : ""
              }`}
            >
              <div>
                <h2 className="text-lg font-bold">{gym.name}</h2>
                <p className="text-xs text-subtle">
                  {titleCase(gym.membershipRole)} · {gym.floor.length} equipment
                  type{gym.floor.length === 1 ? "" : "s"}
                  {` · ${gym.recoveryWindowHours}h strength recovery`}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {gym.floor.map((entry) => (
                  <span
                    key={entry.equipment}
                    className="rounded-full border border-border-hi px-2.5 py-1 text-xs text-muted-fg"
                  >
                    {titleCase(entry.equipment)}
                    {entry.stationCount ? ` · ${entry.stationCount}` : ""}
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => setSelectedGymId(gym.id)}>
                  {gym.id === selectedGym?.id ? "Viewing" : "View Gym"}
                </Button>
                {gym.membershipRole === MembershipRole.Owner ? (
                  <Button size="sm" onClick={() => edit(gym)}>
                    Edit floor
                  </Button>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}

      {selectedGym && selectedGym.membershipRole !== MembershipRole.Member ? (
        <Card className="mt-4 flex flex-col gap-4 p-5">
          <div>
            <h2 className="text-lg font-bold">Members</h2>
            <p className="text-xs text-subtle">
              Grant an existing Athlete access by account email.
            </p>
          </div>
          {selectedGym.membershipRole === MembershipRole.Owner ? (
            <div className="grid gap-3 md:grid-cols-[1fr_10rem_auto] md:items-end">
              <FieldRow label="Account email">
                <Input
                  type="email"
                  value={memberEmail}
                  onChange={(event) => setMemberEmail(event.target.value)}
                />
              </FieldRow>
              <FieldRow label="Role">
                <Select
                  value={memberRole}
                  onChange={(event) =>
                    setMemberRole(event.target.value as MembershipRole)
                  }
                >
                  <option value={MembershipRole.Coach}>Coach</option>
                  <option value={MembershipRole.Member}>Member</option>
                </Select>
              </FieldRow>
              <Button
                variant="primary"
                disabled={pending || memberEmail.trim().length === 0}
                onClick={grantMembership}
              >
                Grant Membership
              </Button>
            </div>
          ) : null}
          <div className="flex flex-col gap-2">
            {(memberships[selectedGym.id] ?? []).map((member) => (
              <div
                key={member.athleteId}
                className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
              >
                <div>
                  <p className="text-sm font-semibold">{member.name}</p>
                  <p className="text-xs text-subtle">
                    {member.email} · {titleCase(member.role)}
                  </p>
                </div>
                {selectedGym.membershipRole === MembershipRole.Owner &&
                member.role !== MembershipRole.Owner ? (
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={pending}
                    onClick={() => revokeMembership(member.athleteId)}
                  >
                    Revoke
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </>
  );
}
