"use client";

import * as React from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChipToggle, FieldRow, Input, Label, Segmented, Select } from "@/components/ui/field";
import { completeOnboarding } from "@/lib/actions/athlete";
import { Equipment, EQUIPMENT_PRESETS } from "@/lib/domain/models/equipment";
import { Sex } from "@/lib/domain/models/athlete";
import { Joint, Muscle } from "@/lib/domain/models/body";
import {
  ImpedimentCategory,
  ImpedimentSeverity,
} from "@/lib/domain/models/impediment";
import { titleCase } from "@/lib/format";

const PRESETS = [
  { key: "fullGym", label: "Full gym" },
  { key: "homeGym", label: "Home gym" },
  { key: "minimal", label: "Minimal" },
  { key: "bodyweight", label: "Bodyweight" },
] as const;

const ALL_EQUIPMENT = Object.values(Equipment).filter((e) => e !== Equipment.None);

type ImpedimentDraft = {
  key: string;
  category: ImpedimentCategory;
  severity: ImpedimentSeverity;
  affectedMuscles: Muscle[];
  affectedJoints: Joint[];
  description: string;
  trimester?: 1 | 2 | 3;
  weeksPostpartum?: number;
};

const MUSCLES = Object.values(Muscle);
const JOINTS = Object.values(Joint);

export function OnboardingForm({ defaultName }: { defaultName: string }) {
  const [name, setName] = React.useState(defaultName);
  const [sex, setSex] = React.useState<Sex>(Sex.Male);
  const [duration, setDuration] = React.useState(60);
  const [equipment, setEquipment] = React.useState<Equipment[]>([
    ...EQUIPMENT_PRESETS.fullGym,
  ]);
  const [impedimentDrafts, setImpedimentDrafts] = React.useState<ImpedimentDraft[]>([]);
  const [pending, setPending] = React.useState(false);

  function applyPreset(key: (typeof PRESETS)[number]["key"]) {
    setEquipment([...EQUIPMENT_PRESETS[key]]);
  }

  function toggleEquipment(item: Equipment) {
    setEquipment((prev) =>
      prev.includes(item) ? prev.filter((e) => e !== item) : [...prev, item]
    );
  }

  function addImpediment() {
    setImpedimentDrafts((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        category: ImpedimentCategory.AcuteInjury,
        severity: ImpedimentSeverity.Moderate,
        affectedMuscles: [],
        affectedJoints: [],
        description: "",
      },
    ]);
  }

  function patch(key: string, next: Partial<ImpedimentDraft>) {
    setImpedimentDrafts((prev) =>
      prev.map((d) => (d.key === key ? { ...d, ...next } : d))
    );
  }

  async function submit() {
    if (equipment.length === 0) {
      toast.error("Pick at least one piece of equipment (or Bodyweight).");
      return;
    }
    setPending(true);
    try {
      await completeOnboarding({
        name,
        sex,
        equipment: equipment.length ? equipment : [Equipment.None],
        preferredDuration: duration,
        impediments: impedimentDrafts.map((d) => ({
          category: d.category,
          severity: d.severity,
          affectedMuscles: d.affectedMuscles,
          affectedJoints: d.affectedJoints,
          description: d.description,
          startDate: new Date().toISOString().slice(0, 10),
          trimester: d.category === ImpedimentCategory.Pregnancy ? (d.trimester ?? 1) : undefined,
          weeksPostpartum:
            d.category === ImpedimentCategory.Postpartum ? (d.weeksPostpartum ?? 0) : undefined,
        })),
      });
    } catch (err) {
      // A redirect throws by design; anything else is a real failure.
      if (err instanceof Error && err.message.includes("NEXT_REDIRECT")) return;
      setPending(false);
      toast.error("Could not save your profile. Check the fields and try again.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldRow label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </FieldRow>
          <FieldRow label="Preferred session length" hint="Drives session building">
            <Input
              type="number"
              min={10}
              max={180}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="font-mono"
            />
          </FieldRow>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Rx loads</Label>
          <Segmented
            value={sex}
            onChange={setSex}
            options={[
              { value: Sex.Male, label: "Male" },
              { value: Sex.Female, label: "Female" },
            ]}
          />
        </div>
      </Card>

      <Card className="flex flex-col gap-3 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-bold">Equipment</h2>
            <p className="text-xs text-subtle">
              Movements you can&apos;t load are filtered out before generation.
            </p>
          </div>
          <span className="font-mono text-xs text-subtle">{equipment.length} selected</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <Button key={p.key} size="sm" onClick={() => applyPreset(p.key)}>
              {p.label}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5 border-t border-border pt-3">
          {ALL_EQUIPMENT.map((item) => (
            <ChipToggle
              key={item}
              active={equipment.includes(item)}
              onClick={() => toggleEquipment(item)}
            >
              {titleCase(item)}
            </ChipToggle>
          ))}
        </div>
      </Card>

      <Card className="flex flex-col gap-3 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-bold">Impediments</h2>
            <p className="text-xs text-subtle">
              Optional. Pregnancy, postpartum, injury and rehab presets constrain every
              generated workout automatically.
            </p>
          </div>
          <Button size="sm" onClick={addImpediment}>
            <Plus size={14} /> Add
          </Button>
        </div>

        {impedimentDrafts.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border-hi px-3 py-4 text-center text-xs text-subtle">
            None active — every movement your equipment supports is on the table.
          </p>
        ) : (
          impedimentDrafts.map((d) => (
            <div key={d.key} className="flex flex-col gap-3 rounded-xl border border-border p-3.5">
              <div className="grid gap-3 sm:grid-cols-2">
                <FieldRow label="Category">
                  <Select
                    value={d.category}
                    onChange={(e) =>
                      patch(d.key, { category: e.target.value as ImpedimentCategory })
                    }
                  >
                    {Object.values(ImpedimentCategory).map((c) => (
                      <option key={c} value={c}>
                        {titleCase(c)}
                      </option>
                    ))}
                  </Select>
                </FieldRow>

                {d.category === ImpedimentCategory.Pregnancy ? (
                  <FieldRow label="Trimester">
                    <Select
                      value={String(d.trimester ?? 1)}
                      onChange={(e) =>
                        patch(d.key, { trimester: Number(e.target.value) as 1 | 2 | 3 })
                      }
                    >
                      <option value="1">First</option>
                      <option value="2">Second</option>
                      <option value="3">Third</option>
                    </Select>
                  </FieldRow>
                ) : d.category === ImpedimentCategory.Postpartum ? (
                  <FieldRow label="Weeks postpartum">
                    <Input
                      type="number"
                      min={0}
                      className="font-mono"
                      value={d.weeksPostpartum ?? 0}
                      onChange={(e) => patch(d.key, { weeksPostpartum: Number(e.target.value) })}
                    />
                  </FieldRow>
                ) : (
                  <FieldRow label="Severity">
                    <Select
                      value={d.severity}
                      onChange={(e) =>
                        patch(d.key, { severity: e.target.value as ImpedimentSeverity })
                      }
                    >
                      {Object.values(ImpedimentSeverity).map((s) => (
                        <option key={s} value={s}>
                          {titleCase(s)}
                        </option>
                      ))}
                    </Select>
                  </FieldRow>
                )}
              </div>

              {d.category !== ImpedimentCategory.Pregnancy &&
              d.category !== ImpedimentCategory.Postpartum ? (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                  <Label>Affected Muscles</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {MUSCLES.map((muscle) => (
                      <ChipToggle
                        key={muscle}
                        active={d.affectedMuscles.includes(muscle)}
                        onClick={() =>
                          patch(d.key, {
                            affectedMuscles: d.affectedMuscles.includes(muscle)
                              ? d.affectedMuscles.filter((item) => item !== muscle)
                              : [...d.affectedMuscles, muscle],
                          })
                        }
                      >
                        {titleCase(muscle)}
                      </ChipToggle>
                    ))}
                  </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Affected Joints</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {JOINTS.map((joint) => (
                        <ChipToggle
                          key={joint}
                          active={d.affectedJoints.includes(joint)}
                          onClick={() =>
                            patch(d.key, {
                              affectedJoints: d.affectedJoints.includes(joint)
                                ? d.affectedJoints.filter((item) => item !== joint)
                                : [...d.affectedJoints, joint],
                            })
                          }
                        >
                          {titleCase(joint)}
                        </ChipToggle>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="flex items-end gap-3">
                <FieldRow label="Note" className="flex-1">
                  <Input
                    placeholder="Left shoulder — 6 weeks post-op"
                    value={d.description}
                    onChange={(e) => patch(d.key, { description: e.target.value })}
                  />
                </FieldRow>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() =>
                    setImpedimentDrafts((prev) => prev.filter((x) => x.key !== d.key))
                  }
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            </div>
          ))
        )}
      </Card>

      <div className="flex justify-end">
        <Button variant="primary" disabled={pending} onClick={submit}>
          {pending ? "Saving…" : "Start training"}
        </Button>
      </div>
    </div>
  );
}
