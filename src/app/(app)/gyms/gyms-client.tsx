"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChipToggle, FieldRow, Input } from "@/components/ui/field";
import { createGymAction, updateGymAction } from "@/lib/actions/gym";
import { Equipment } from "@/lib/domain/models/equipment";
import type { Gym, GymFloorEntry } from "@/lib/domain/models/gym";
import { titleCase } from "@/lib/format";

const EQUIPMENT = Object.values(Equipment).filter(
  (equipment) => equipment !== Equipment.None,
);

type Draft = { id?: string; name: string; floor: GymFloorEntry[] };

export function GymsClient({ gyms }: { gyms: Gym[] }) {
  const router = useRouter();
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [pending, startTransition] = React.useTransition();

  function edit(gym?: Gym) {
    setDraft(
      gym
        ? { id: gym.id, name: gym.name, floor: gym.floor }
        : { name: "", floor: [] },
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
        const input = { name: draft.name, floor: draft.floor };
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

  return (
    <>
      <PageHeader
        title="Gyms"
        subtitle="Declare the equipment available on each Gym floor."
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
            <Card key={gym.id} className="flex flex-col gap-3 p-5">
              <div>
                <h2 className="text-lg font-bold">{gym.name}</h2>
                <p className="text-xs text-subtle">
                  {gym.floor.length} equipment type{gym.floor.length === 1 ? "" : "s"}
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
              <Button size="sm" onClick={() => edit(gym)}>
                Edit floor
              </Button>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
