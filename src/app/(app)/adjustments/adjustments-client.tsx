"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { revokeLoadAdjustmentAction } from "@/lib/actions/load-adjustment";
import type { ActiveLoadAdjustment } from "@/lib/training/load-adjustment";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";

export function AdjustmentsClient({
  adjustments,
}: {
  adjustments: ActiveLoadAdjustment[];
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

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

  return (
    <>
      <PageHeader
        title="Load Adjustments"
        subtitle="Standing movement-specific load policies. Nothing increases automatically."
      />
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
