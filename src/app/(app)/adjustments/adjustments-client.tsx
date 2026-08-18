"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { revokeLoadAdjustmentAction } from "@/lib/actions/load-adjustment";
import { addImpediment } from "@/lib/actions/athlete";
import { Joint, Muscle } from "@/lib/domain/models/body";
import {
  ImpedimentCategory,
  ImpedimentSeverity,
} from "@/lib/domain/models/impediment";
import type { ActiveLoadAdjustment } from "@/lib/training/load-adjustment";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { FieldRow, Input, Select, Textarea } from "@/components/ui/field";
import { formatLabel } from "@/lib/format";

export function AdjustmentsClient({
  adjustments,
  showImpedimentForm,
}: {
  adjustments: ActiveLoadAdjustment[];
  showImpedimentForm: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [editingImpediment, setEditingImpediment] =
    React.useState(showImpedimentForm);
  const [areaType, setAreaType] = React.useState<"joint" | "muscle">("joint");
  const [area, setArea] = React.useState<string>(Joint.Shoulders);
  const [severity, setSeverity] = React.useState(ImpedimentSeverity.Moderate);
  const [description, setDescription] = React.useState("");
  const [startDate, setStartDate] = React.useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [endDate, setEndDate] = React.useState("");

  function revoke(adjustment: ActiveLoadAdjustment) {
    if (
      !window.confirm(
        `Revoke the ${adjustment.percent}% ${adjustment.movementName} adjustment? Future Assigned Workouts may become heavier.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      try {
        await revokeLoadAdjustmentAction(adjustment.id);
        toast.success("Load Adjustment revoked");
        router.refresh();
      } catch {
        toast.error("Could not revoke that Load Adjustment.");
      }
    });
  }

  function saveImpediment() {
    startTransition(async () => {
      try {
        await addImpediment({
          category: ImpedimentCategory.AcuteInjury,
          severity,
          affectedMuscles: areaType === "muscle" ? [area] : [],
          affectedJoints: areaType === "joint" ? [area] : [],
          description,
          startDate,
          endDate: endDate || undefined,
        });
        toast.success("Impediment recorded and future assignments reconciled");
        setEditingImpediment(false);
        router.replace("/adjustments");
        router.refresh();
      } catch {
        toast.error("Could not record that Impediment.");
      }
    });
  }

  return (
    <>
      <PageHeader
        title="Load Adjustments"
        subtitle="Standing movement-specific load policies. Nothing increases automatically."
        action={
          <Button onClick={() => setEditingImpediment(true)}>
            Record Impediment
          </Button>
        }
      />
      {editingImpediment ? (
        <Card className="mb-4 flex flex-col gap-4 p-5">
          <div>
            <h2 className="font-bold">Record a dated Impediment</h2>
            <p className="text-xs text-subtle">
              Use this for pain or injury. Unlike a standing Load Adjustment, it can expire.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <FieldRow label="Affected area type">
              <Select
                value={areaType}
                onChange={(event) => {
                  const next = event.target.value as "joint" | "muscle";
                  setAreaType(next);
                  setArea(
                    next === "joint"
                      ? Joint.Shoulders
                      : Muscle.Shoulders,
                  );
                }}
              >
                <option value="joint">Joint</option>
                <option value="muscle">Muscle</option>
              </Select>
            </FieldRow>
            <FieldRow label="Affected area">
              <Select value={area} onChange={(event) => setArea(event.target.value)}>
                {(areaType === "joint"
                  ? Object.values(Joint)
                  : Object.values(Muscle)
                ).map((value) => (
                  <option key={value} value={value}>
                    {formatLabel(value)}
                  </option>
                ))}
              </Select>
            </FieldRow>
            <FieldRow label="Severity">
              <Select
                value={severity}
                onChange={(event) =>
                  setSeverity(event.target.value as ImpedimentSeverity)
                }
              >
                {Object.values(ImpedimentSeverity).map((value) => (
                  <option key={value} value={value}>
                    {formatLabel(value)}
                  </option>
                ))}
              </Select>
            </FieldRow>
            <FieldRow label="Start date">
              <Input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </FieldRow>
            <FieldRow label="End date" hint="Optional">
              <Input
                type="date"
                value={endDate}
                min={startDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </FieldRow>
          </div>
          <FieldRow label="What is going on?">
            <Textarea
              value={description}
              maxLength={400}
              onChange={(event) => setDescription(event.target.value)}
            />
          </FieldRow>
          <div className="flex gap-2">
            <Button variant="primary" disabled={pending} onClick={saveImpediment}>
              Save Impediment
            </Button>
            <Button disabled={pending} onClick={() => setEditingImpediment(false)}>
              Cancel
            </Button>
          </div>
        </Card>
      ) : null}
      {adjustments.length === 0 ? (
        <Card>
          <EmptyState
            title="No active Load Adjustments"
            hint="After lowering a weighted Movement in an Assigned Workout, you can choose to carry that ratio forward."
          />
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {adjustments.map((adjustment) => (
            <Card key={adjustment.id} className="flex flex-col gap-3 p-5">
              <div>
                <h2 className="font-bold">{adjustment.movementName}</h2>
                <p className="text-sm text-muted-fg">
                  {adjustment.percent}% of each programmed load · reference {adjustment.referenceLoad} lb
                </p>
              </div>
              {adjustment.reviewDue ? (
                <p className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm">
                  You have hit this load cleanly {adjustment.cleanSessionRun} sessions running. Review whether you still need this adjustment.
                </p>
              ) : (
                <p className="text-xs text-subtle">
                  {adjustment.cleanSessionRun}/{adjustment.reviewAfterSessions} clean sessions toward review
                </p>
              )}
              <Button
                variant="danger"
                disabled={pending}
                onClick={() => revoke(adjustment)}
              >
                Revoke adjustment
              </Button>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
